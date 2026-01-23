import { BaseGame, type GameAction } from "../BaseGame";
import {
  type MonopolyState,
  type MonopolyAction,
  type MonopolyPlayer,
  type OwnedProperty,
  type Card,
  type GameLog,
  BOARD_SPACES,
  CHANCE_CARDS,
  CHEST_CARDS,
  START_MONEY,
  SALARY,
  JAIL_FINE,
  MAX_JAIL_TURNS,
  PLAYER_COLORS,
  type TradeOffer,
} from "./types";
import { trans } from "../../stores/languageStore";
import type { Player } from "../../stores/roomStore";

export default class Monopoly extends BaseGame<MonopolyState> {
  private chanceCards: Card[] = [...CHANCE_CARDS].sort(
    () => Math.random() - 0.5,
  );
  private chestCards: Card[] = [...CHEST_CARDS].sort(() => Math.random() - 0.5);
  private getOutOfJailCards: Map<string, number> = new Map(); // playerId -> count

  getInitState(): MonopolyState {
    // Initialize 4 player slots
    const initialPlayers: MonopolyPlayer[] = [];
    for (let i = 0; i < 4; i++) {
      const player = this.players[i];
      initialPlayers.push({
        id: player?.id || null,
        username: player?.username || `Player ${i + 1}`,
        color: PLAYER_COLORS[i],
        position: 0,
        money: START_MONEY,
        inJail: false,
        jailTurns: 0,
        isBankrupt: false,
        isBot: false,
        moneyHistory: [START_MONEY],
      });
    }

    return {
      players: initialPlayers,
      currentPlayerIndex: 0,
      properties: [],
      diceValues: null,
      doublesCount: 0,
      hasRolled: false,
      canRollAgain: false,
      gamePhase: "waiting",
      winner: null,
      pendingAction: null,
      lastAction: null,
      logs: [],
      tradeOffers: [],
    };
  }

  // Notify UI and broadcast - creates new state reference for React
  private notifyAndBroadcast(): void {
    // Sync money history before broadcasting
    this.state.players.forEach((p) => {
      // Ensure history exists
      if (!p.moneyHistory) p.moneyHistory = [];

      // Add current money if different from last entry or empty
      const lastEntry = p.moneyHistory[p.moneyHistory.length - 1];
      if (lastEntry !== p.money) {
        p.moneyHistory.push(p.money);
        // Cap at 30 items
        if (p.moneyHistory.length > 30) {
          p.moneyHistory.shift();
        }
      }
    });
    this.syncState();
  }

  // === Trading ===

  private handleOfferTrade(
    fromPlayerId: string,
    toPlayerId: string,
    spaceId: number,
    price: number,
  ): void {
    if (!this.isHost) return;

    // Cap active trade offers
    if (this.state.tradeOffers.length >= 20) {
      this.addLog(
        {
          en: "Too many active trade offers. Please cancel or reject some first.",
          vi: "Quá nhiều lời mời giao dịch. Vui lòng hủy hoặc từ chối bớt.",
        },
        "alert",
      );
      this.notifyAndBroadcast();
      return;
    }

    // Validation:
    // 1. Property must exist.
    // 2. Either 'from' owns it (Sell Offer) OR 'to' owns it (Buy Offer).
    const property = this.state.properties.find((p) => p.spaceId === spaceId);
    if (!property) return;

    const isSellOffer = property.ownerId === fromPlayerId;
    const isBuyOffer = property.ownerId === toPlayerId;

    if (!isSellOffer && !isBuyOffer) return; // Neither involved party owns it
    if (price < 0) return;

    const offer: TradeOffer = {
      id: Math.random().toString(36).substr(2, 9),
      fromPlayerId,
      toPlayerId,
      propertyId: spaceId,
      price,
      status: "pending",
    };

    this.state.tradeOffers.push(offer);

    const fromPlayer = this.state.players.find((p) => p.id === fromPlayerId);
    const toPlayer = this.state.players.find((p) => p.id === toPlayerId);
    const space = BOARD_SPACES[spaceId];

    if (isSellOffer) {
      this.addLog(
        {
          en: `${fromPlayer?.username} offered to sell ${trans(
            space?.name,
          )} to ${toPlayer?.username} for ${price}đ`,
          vi: `${fromPlayer?.username} đề nghị bán ${trans(space?.name)} cho ${
            toPlayer?.username
          } với giá ${price}đ`,
        },
        "info",
      );
    } else {
      this.addLog(
        {
          en: `${fromPlayer?.username} offered to buy ${trans(
            space?.name,
          )} from ${toPlayer?.username} for ${price}đ`,
          vi: `${fromPlayer?.username} đề nghị mua ${trans(space?.name)} từ ${
            toPlayer?.username
          } với giá ${price}đ`,
        },
        "info",
      );
    }

    this.notifyAndBroadcast();

    // Check if target is bot
    if (toPlayer?.isBot) {
      this.botEvaluateTrade(offer);
    }
  }

  private handleRespondTrade(
    offerId: string,
    accepted: boolean,
    message?: string,
  ): void {
    if (!this.isHost) return;

    const offerIndex = this.state.tradeOffers.findIndex(
      (o) => o.id === offerId,
    );
    if (offerIndex === -1) return;

    const offer = this.state.tradeOffers[offerIndex];
    const property = this.state.properties.find(
      (p) => p.spaceId === offer.propertyId,
    );
    const space = BOARD_SPACES[offer.propertyId];

    if (accepted && property) {
      // Identify Buyer and Seller
      const isSellOffer = property.ownerId === offer.fromPlayerId;

      const buyerId = isSellOffer ? offer.toPlayerId : offer.fromPlayerId;
      const sellerId = isSellOffer ? offer.fromPlayerId : offer.toPlayerId;

      const buyer = this.state.players.find((p) => p.id === buyerId);
      const seller = this.state.players.find((p) => p.id === sellerId);

      if (!buyer || !seller) return;

      if (buyer.money < offer.price) {
        this.addLog(
          {
            en: `Trade failed: ${buyer.username} cannot afford ${offer.price}đ`,
            vi: `Giao dịch thất bại: ${buyer.username} không đủ ${offer.price}đ`,
          },
          "alert",
        );
        this.state.tradeOffers.splice(offerIndex, 1);
        this.notifyAndBroadcast();
        return;
      }

      // Execute Trade
      buyer.money -= offer.price;
      seller.money += offer.price;
      property.ownerId = buyer.id!;
      offer.status = "accepted";

      this.addLog(
        {
          en: `Trade successful! ${buyer.username} bought ${trans(
            space?.name,
          )} from ${seller.username} for ${offer.price}đ`,
          vi: `Giao dịch thành công! ${buyer.username} mua ${trans(
            space?.name,
          )} từ ${seller.username} giá ${offer.price}đ`,
        },
        "action",
      );
    } else {
      offer.status = "declined";
      const responder = this.state.players.find(
        (p) => p.id === offer.toPlayerId,
      );
      const initiator = this.state.players.find(
        (p) => p.id === offer.fromPlayerId,
      );

      // Attach message if provided
      if (message) {
        offer.responseMessage = { en: message, vi: message };
      }

      this.addLog(
        {
          en: `${responder?.username} declined the trade offer from ${initiator?.username}`,
          vi: `${responder?.username} từ chối lời mời giao dịch từ ${initiator?.username}`,
        },
        "info",
      );

      this.notifyAndBroadcast();

      // Auto remove after 5 seconds if not closed by user
      setTimeout(() => {
        const idx = this.state.tradeOffers.findIndex((o) => o.id === offerId);
        if (idx !== -1 && this.state.tradeOffers[idx].status === "declined") {
          this.state.tradeOffers.splice(idx, 1);
          this.notifyAndBroadcast();
        }
      }, 8000);
      return; // EXIT HERE so we don't splice immediately below
    }

    // Remove offer after delay or immediately (for accepted trades)
    this.state.tradeOffers.splice(offerIndex, 1);
    this.notifyAndBroadcast();
  }

  private handleCancelTrade(offerId: string): void {
    if (!this.isHost) return;
    const index = this.state.tradeOffers.findIndex((o) => o.id === offerId);
    if (index !== -1) {
      this.state.tradeOffers.splice(index, 1);
      this.notifyAndBroadcast();
    }
  }

  // === Bot Logic ===

  private botEvaluateTrade(originalOffer: TradeOffer): void {
    setTimeout(() => {
      // Fetch fresh offer object from state
      const offer = this.state.tradeOffers.find(
        (o) => o.id === originalOffer.id,
      );
      if (!offer || offer.status !== "pending") return;

      const bot = this.state.players.find((p) => p.id === offer.toPlayerId);
      if (!bot || !bot.isBot) return;

      const space = BOARD_SPACES[offer.propertyId];
      if (!space) return;

      // Determine if Bot is Buyer or Seller
      const property = this.state.properties.find(
        (p) => p.spaceId === offer.propertyId,
      );
      const isBotOwner = property?.ownerId === bot.id;

      // Calculate Land Value
      let landValue = 0;
      if (
        space.type === "property" ||
        space.type === "railroad" ||
        space.type === "utility"
      ) {
        landValue = space.price;
      }

      // Monopoly Check
      const colorGroup = BOARD_SPACES.filter(
        (s) =>
          s.type === "property" &&
          space.type === "property" &&
          s.color === space.color,
      );
      const botOwnedInColor = this.state.properties.filter(
        (p) =>
          p.ownerId === bot.id && colorGroup.some((s) => s.id === p.spaceId),
      ).length;

      // Bonus: If bot has 2/3 (or close to completing), value is higher
      if (colorGroup.length > 0) {
        if (botOwnedInColor >= colorGroup.length - 1) {
          landValue *= 2.5; // High desire to complete set
        } else if (botOwnedInColor > 0) {
          landValue *= 1.5;
        }
      }

      // Bot Difficulty Multiplier (Assume Normal = 1.0)
      const difficultyMultiplier = 1.0;

      if (isBotOwner) {
        // Bot is SELLING (Receiving a Buy Offer)
        // Accept if OfferPrice >= LandValue * Premium
        const minPrice = landValue * 1.2; // Want 20% profit over "value"

        this.addLog(
          {
            en: `${bot.username} thinks ${trans(
              space?.name,
            )} is worth ${minPrice}đ`,
            vi: `${bot.username} nghĩ ${trans(
              space?.name,
            )} đáng giá ${minPrice}đ`,
          },
          "info",
        );

        if (offer.price >= minPrice) {
          this.handleRespondTrade(offer.id, true);
        } else {
          // Bot declines but gives a hint
          // We must directly mutate the state object here before calling handleRespondTrade
          // because handleRespondTrade will trigger notifyAndBroadcast which copies it
          offer.responseMessage = {
            en: `I want at least ${minPrice.toLocaleString()}đ`,
            vi: `Tôi muốn ít nhất ${minPrice.toLocaleString()}đ`,
          };
          this.handleRespondTrade(offer.id, false);
        }
      } else {
        // Bot is BUYING (Receiving a Sell Offer - existing logic)
        const maxPrice = landValue * difficultyMultiplier;
        const canAfford = bot.money >= offer.price;
        const isGoodPrice = offer.price <= maxPrice;

        this.addLog(
          {
            en: `${bot.username} thinks ${trans(
              space?.name,
            )} is worth ${maxPrice}đ`,
            vi: `${bot.username} nghĩ ${trans(
              space?.name,
            )} đáng giá ${maxPrice}đ`,
          },
          "info",
        );

        if (canAfford && isGoodPrice) {
          this.handleRespondTrade(offer.id, true);
        } else {
          offer.responseMessage = canAfford
            ? {
                en: `I only pay up to ${maxPrice.toLocaleString()}đ`,
                vi: `Tôi chỉ trả tối đa ${maxPrice.toLocaleString()}đ`,
              }
            : {
                en: `I don't have enough money`,
                vi: `Tôi không đủ tiền`,
              };
          this.handleRespondTrade(offer.id, false);
        }
      }
    }, 2000); // Simulate bot thinking
  }

  // === Economy ===

  private handleSellHouse(playerId: string, spaceId: number): void {
    if (!this.isHost) return;
    const space = BOARD_SPACES[spaceId];
    const ownership = this.state.properties.find(
      (p) => p.spaceId === spaceId && p.ownerId === playerId,
    );

    if (
      !space ||
      !ownership ||
      ownership.houses <= 0 ||
      space.type !== "property" ||
      !space.houseCost
    )
      return;

    // Check even build rule (simplified: allow selling from max properties)
    // For now just allow selling one by one

    ownership.houses--;
    const refund = Math.floor(space.houseCost * 0.5);
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.money += refund;
      this.addLog(
        {
          en: `${player.username} sold a house on ${trans(
            space?.name,
          )} for ${refund}đ`,
          vi: `${player.username} bán 1 nhà trên ${trans(
            space?.name,
          )} được ${refund}đ`,
        },
        "action",
      );
    }

    this.notifyAndBroadcast();
  }

  private handleMortgage(playerId: string, spaceId: number): void {
    if (!this.isHost) return;
    const space = BOARD_SPACES[spaceId];
    const ownership = this.state.properties.find(
      (p) => p.spaceId === spaceId && p.ownerId === playerId,
    );

    if (
      !space ||
      !ownership ||
      ownership.mortgaged ||
      ownership.houses > 0 ||
      (space.type !== "property" &&
        space.type !== "railroad" &&
        space.type !== "utility")
    )
      return;

    const mortgageValue = Math.floor(space.price * 0.5);
    ownership.mortgaged = true;

    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      player.money += mortgageValue;
      this.addLog(
        {
          en: `${player.username} mortgaged ${trans(
            space?.name,
          )} for ${mortgageValue}đ`,
          vi: `${player.username} thế chấp ${trans(
            space?.name,
          )} được ${mortgageValue}đ`,
        },
        "action",
      );
    }
    this.notifyAndBroadcast();
  }

  private handleUnmortgage(playerId: string, spaceId: number): void {
    if (!this.isHost) return;
    const space = BOARD_SPACES[spaceId];
    const ownership = this.state.properties.find(
      (p) => p.spaceId === spaceId && p.ownerId === playerId,
    );

    if (
      !space ||
      !ownership ||
      !ownership.mortgaged ||
      (space.type !== "property" &&
        space.type !== "railroad" &&
        space.type !== "utility")
    )
      return;

    const mortgageValue = Math.floor(space.price * 0.5);
    const interest = Math.floor(mortgageValue * 0.1);
    const cost = mortgageValue + interest;

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.money < cost) return;

    player.money -= cost;
    ownership.mortgaged = false;

    this.addLog(
      {
        en: `${player.username} unmortgaged ${trans(space?.name)} for ${cost}đ`,
        vi: `${player.username} chuộc ${trans(space?.name)} giá ${cost}đ`,
      },
      "action",
    );

    this.notifyAndBroadcast();
  }

  onSocketGameAction(data: { action: GameAction }): void {
    const action = data.action as MonopolyAction;

    switch (action.type) {
      case "START_GAME":
        this.handleStartGame();
        break;
      case "ROLL_DICE":
        this.handleRollDice(action.playerId);
        break;
      case "BUY_PROPERTY":
        this.handleBuyProperty(action.playerId, action.spaceId);
        break;
      case "DECLINE_PROPERTY":
        this.handleDeclineProperty(action.playerId);
        break;
      case "BUILD_HOUSE":
        this.handleBuildHouse(action.playerId, action.spaceId);
        break;
      case "PAY_RENT":
        this.handlePayRent(action.playerId);
        break;
      case "PAY_TAX":
        this.handlePayTax(action.playerId);
        break;
      case "USE_CARD":
        this.handleUseCard(action.playerId);
        break;
      case "PAY_JAIL_FINE":
        this.handlePayJailFine(action.playerId);
        break;
      case "END_TURN":
        this.handleEndTurn(action.playerId);
        break;
      case "ADD_BOT":
        this.handleAddBot(action.slotIndex);
        break;
      case "REMOVE_BOT":
        this.handleRemoveBot(action.slotIndex);
        break;
      case "OFFER_TRADE":
        this.handleOfferTrade(
          action.fromPlayerId,
          action.toPlayerId,
          action.spaceId,
          action.price,
        );
        break;
      case "RESPOND_TRADE":
        this.handleRespondTrade(
          action.offerId,
          action.accepted,
          action.message,
        );
        break;
      case "CANCEL_TRADE":
        this.handleCancelTrade(action.offerId);
        break;
      case "SELL_HOUSE":
        this.handleSellHouse(action.playerId, action.spaceId);
        break;
      case "MORTGAGE":
        this.handleMortgage(action.playerId, action.spaceId);
        break;
      case "UNMORTGAGE":
        this.handleUnmortgage(action.playerId, action.spaceId);
        break;
      case "RESET_GAME":
        this.reset();
        break;
    }
  }

  private addLog(
    message: string | { en: string; vi: string },
    type: "info" | "action" | "alert" = "info",
  ): void {
    const log: GameLog = {
      id: Math.random().toString(36).substr(2, 9),
      message,
      type,
      timestamp: Date.now(),
    };
    this.state.logs.push(log);

    // Keep only last 30 logs to save bandwidth
    if (this.state.logs.length > 30) {
      this.state.logs = this.state.logs.slice(-30);
    }

    this.state.lastAction = message;
  }

  // === Game Flow ===

  private handleStartGame(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "waiting") return;

    // Count active players
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    if (activePlayers.length < 2) return;

    this.state = {
      ...this.state,
      gamePhase: "playing",
      currentPlayerIndex: this.findFirstActivePlayer(),
      lastAction: { en: "Game started!", vi: "Trò chơi bắt đầu!" },
      logs: [],
    };
    this.addLog({ en: "Game started!", vi: "Trò chơi bắt đầu!" }, "info");

    this.notifyAndBroadcast();
    this.checkBotTurn();
  }

  private findFirstActivePlayer(): number {
    for (let i = 0; i < this.state.players.length; i++) {
      if (this.state.players[i].id && !this.state.players[i].isBankrupt) {
        return i;
      }
    }
    return 0;
  }

  private handleRollDice(playerId: string): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId) return;
    if (this.state.hasRolled && !this.state.canRollAgain) return;
    if (this.state.pendingAction) return;

    // Roll dice
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    // const total = die1 + die2;
    // const isDoubles = die1 === die2;

    this.state.diceValues = [die1, die2];
    this.state.hasRolled = true;
    this.addLog({ en: "Rolling...", vi: "Đang đổ xí ngầu..." }, "info");

    this.notifyAndBroadcast();

    // Delay movement to allow UI animation to finish
    setTimeout(() => {
      this.processDiceResult(playerId, die1, die2);
    }, 1200);
  }

  private processDiceResult(
    playerId: string,
    die1: number,
    die2: number,
  ): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;

    const total = die1 + die2;
    const isDoubles = die1 === die2;

    // Track doubles
    if (isDoubles) {
      this.state.doublesCount++;
      // 3 doubles = go to jail
      if (this.state.doublesCount >= 3) {
        this.sendToJail(player);
        this.addLog(
          {
            en: `${player.username} rolled 3 doubles, goes to jail!`,
            vi: `${player.username} đổ 3 lần đôi, phải vào tù!`,
          },
          "alert",
        );
        this.endTurn();
        this.notifyAndBroadcast(); // Notify changes
        return;
      }
      this.state.canRollAgain = true;
    } else {
      this.state.canRollAgain = false;
    }

    // In jail logic
    if (player.inJail) {
      if (isDoubles) {
        player.inJail = false;
        player.jailTurns = 0;
        this.addLog(
          {
            en: `${player.username} rolled doubles and escapes jail!`,
            vi: `${player.username} đổ đôi và được ra tù!`,
          },
          "action",
        );
        this.movePlayer(player, total);
      } else {
        player.jailTurns++;
        if (player.jailTurns >= MAX_JAIL_TURNS) {
          // Force pay fine
          player.money -= JAIL_FINE;
          player.inJail = false;
          player.jailTurns = 0;
          this.addLog(
            {
              en: `${player.username} paid ${JAIL_FINE}đ and leaves jail`,
              vi: `${player.username} trả ${JAIL_FINE}đ để ra tù`,
            },
            "action",
          );
          this.movePlayer(player, total);
        } else {
          this.state.lastAction = {
            en: `${player.username} stays in jail (turn ${player.jailTurns}/${MAX_JAIL_TURNS})`,
            vi: `${player.username} ở trong tù (lượt ${player.jailTurns}/${MAX_JAIL_TURNS})`,
          };
          this.state.canRollAgain = false;
        }
      }
    } else {
      this.movePlayer(player, total);
    }

    this.notifyAndBroadcast();

    // Check for bot turn after resolving any pending actions
    if (!this.state.pendingAction) {
      this.checkBotTurn();
    }
  }

  private movePlayer(player: MonopolyPlayer, spaces: number): void {
    const oldPosition = player.position;
    const newPosition = (player.position + spaces) % 40;

    // Passed GO?
    if (newPosition < oldPosition && spaces > 0) {
      player.money += SALARY;
      this.addLog(
        {
          en: `${player.username} passed GO, collects ${SALARY}đ`,
          vi: `${player.username} đi qua KHỞI HÀNH, nhận ${SALARY}đ`,
        },
        "info",
      );
    }

    player.position = newPosition;
    this.handleLanding(player);
  }

  private handleLanding(player: MonopolyPlayer): void {
    const space = BOARD_SPACES[player.position];
    if (!space) return;

    switch (space.type) {
      case "go":
        // Just landed, already handled passing GO
        this.addLog(
          {
            en: `${player.username} landed on GO`,
            vi: `${player.username} vào ô KHỞI HÀNH`,
          },
          "info",
        );
        break;

      case "property":
      case "railroad":
      case "utility":
        this.handlePropertyLanding(player, space.id);
        break;

      case "tax":
        this.state.pendingAction = {
          type: "PAY_TAX",
          amount: space.taxAmount || 0,
        };
        this.addLog(
          {
            en: `${player.username} must pay ${space.taxAmount}đ tax`,
            vi: `${player.username} phải nộp thuế ${space.taxAmount}đ`,
          },
          "alert",
        );
        break;

      case "chance":
        this.drawCard(player, "chance");
        break;

      case "chest":
        this.drawCard(player, "chest");
        break;

      case "jail":
        // Just visiting
        this.addLog(
          {
            en: `${player.username} is just visiting jail`,
            vi: `${player.username} thăm nuôi tù`,
          },
          "info",
        );
        break;

      case "parking":
        // Free parking, nothing happens
        this.addLog(
          {
            en: `${player.username} landed on Free Parking`,
            vi: `${player.username} vào Bãi Đỗ Xe`,
          },
          "info",
        );
        break;

      case "gotojail":
        this.sendToJail(player);
        this.addLog(
          {
            en: `${player.username} goes to jail!`,
            vi: `${player.username} vào tù!`,
          },
          "alert",
        );
        break;
    }
  }

  private handlePropertyLanding(player: MonopolyPlayer, spaceId: number): void {
    const space = BOARD_SPACES[spaceId];
    const ownership = this.state.properties.find((p) => p.spaceId === spaceId);

    if (!ownership) {
      // Unowned - offer to buy
      if (
        (space.type === "property" ||
          space.type === "railroad" ||
          space.type === "utility") &&
        space.price &&
        player.money >= space.price
      ) {
        this.state.pendingAction = { type: "BUY_DECISION", spaceId };
        this.addLog(
          {
            en: `${player.username} can buy ${trans(space?.name)} for ${
              space.price
            }đ`,
            vi: `${player.username} có thể mua ${trans(space?.name)} giá ${
              space.price
            }đ`,
          },
          "action",
        );
      } else {
        this.addLog(
          {
            en: `${player.username} cannot afford ${trans(space?.name)}`,
            vi: `${player.username} không đủ tiền mua ${trans(space?.name)}`,
          },
          "alert",
        );
      }
    } else if (ownership.ownerId !== player.id) {
      if (ownership.mortgaged) {
        this.addLog(
          {
            en: `${player.username} landed on ${trans(
              space.name,
            )} which is mortgaged. No rent!`,
            vi: `${player.username} vào ${trans(
              space.name,
            )} đang thế chấp. Không cần trả tiền thuê!`,
          },
          "info",
        );
      } else {
        // Pay rent
        const rent = this.calculateRent(spaceId, ownership);
        const owner = this.state.players.find(
          (p) => p.id === ownership.ownerId,
        );
        if (owner && !owner.isBankrupt) {
          this.state.pendingAction = {
            type: "PAY_RENT",
            amount: rent,
            toPlayerId: ownership.ownerId,
          };
          this.addLog(
            {
              en: `${player.username} owes ${rent}đ rent to ${owner.username}`,
              vi: `${player.username} trả ${rent}đ tiền thuê cho ${owner.username}`,
            },
            "alert",
          );
        }
      }
    } else {
      this.addLog(
        {
          en: `${player.username} landed on their own property`,
          vi: `${player.username} vào nhà mình`,
        },
        "info",
      );
    }
  }

  private calculateRent(spaceId: number, ownership: OwnedProperty): number {
    const space = BOARD_SPACES[spaceId];
    if (!space) return 0;

    if (space.type === "railroad") {
      // Count railroads owned by this player
      const railroadCount = this.state.properties.filter(
        (p) =>
          p.ownerId === ownership.ownerId &&
          BOARD_SPACES[p.spaceId]?.type === "railroad",
      ).length;
      return (space.baseRent || 250) * railroadCount;
    }

    if (space.type === "utility") {
      // Count utilities owned
      const utilityCount = this.state.properties.filter(
        (p) =>
          p.ownerId === ownership.ownerId &&
          BOARD_SPACES[p.spaceId]?.type === "utility",
      ).length;
      const diceTotal =
        (this.state.diceValues?.[0] || 1) + (this.state.diceValues?.[1] || 1);
      return (
        space.baseRent + (utilityCount === 2 ? diceTotal * 10 : diceTotal * 4)
      );
    }

    // Regular property
    if (space.type !== "property" || !space.rent) return 0;

    // Check if player owns full color set
    const colorProperties = BOARD_SPACES.filter(
      (s) => s.type === "property" && s.color === space.color,
    );
    const ownedInColor = colorProperties.filter((s) =>
      this.state.properties.some(
        (p) => p.spaceId === s.id && p.ownerId === ownership.ownerId,
      ),
    ).length;
    const ownsFullSet = ownedInColor === colorProperties.length;

    const houses = ownership.houses;
    if (houses > 0 && houses <= 5) {
      return space.rent[houses];
    }

    // Base rent, doubled if full set with no houses
    return ownsFullSet ? space.rent[0] * 2 : space.rent[0];
  }

  private drawCard(player: MonopolyPlayer, type: "chance" | "chest"): void {
    const cards = type === "chance" ? this.chanceCards : this.chestCards;
    const card = cards.shift();
    if (!card) return;

    // Put card back at bottom (unless it's get out of jail free)
    if (card.action.type !== "GET_OUT_JAIL") {
      cards.push(card);
    }

    this.state.pendingAction = { type: "CARD", card };
    this.addLog(
      {
        en: `${player.username} draws: ${trans(card.text)}`,
        vi: `${player.username} rút thẻ: ${trans(card.text)}`,
      },
      "action",
    );
  }

  private sendToJail(player: MonopolyPlayer): void {
    player.position = 10; // Jail position
    player.inJail = true;
    player.jailTurns = 0;
    this.state.canRollAgain = false;
  }

  // === Property Actions ===

  private handleBuyProperty(playerId: string, spaceId: number): void {
    if (!this.isHost) return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId) return;

    const pending = this.state.pendingAction;
    if (
      !pending ||
      pending.type !== "BUY_DECISION" ||
      pending.spaceId !== spaceId
    )
      return;

    const space = BOARD_SPACES[spaceId];
    if (
      !space ||
      (space.type !== "property" &&
        space.type !== "railroad" &&
        space.type !== "utility") ||
      player.money < space.price
    )
      return;

    player.money -= space.price;
    this.state.properties.push({
      spaceId,
      ownerId: player.id!,
      houses: 0,
      mortgaged: false,
    });

    this.state.pendingAction = null;
    this.addLog(
      {
        en: `${player.username} bought ${trans(space?.name)} for ${
          space.price
        }đ`,
        vi: `${player.username} đã mua ${trans(space?.name)} với giá ${
          space.price
        }đ`,
      },
      "action",
    );

    this.notifyAndBroadcast();
    this.checkBotTurn();
  }

  private handleDeclineProperty(playerId: string): void {
    if (!this.isHost) return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId) return;
    if (
      !this.state.pendingAction ||
      this.state.pendingAction.type !== "BUY_DECISION"
    )
      return;

    const space = BOARD_SPACES[this.state.pendingAction.spaceId];
    this.state.pendingAction = null;
    this.addLog(
      {
        en: `${player.username} declined to buy ${trans(space?.name)}`,
        vi: `${player.username} không mua ${trans(space?.name)}`,
      },
      "info",
    );

    this.notifyAndBroadcast();
    this.checkBotTurn();
  }

  canBuildHouse(
    playerId: string,
    spaceId: number,
  ): { allowed: boolean; reason?: { en: string; vi: string } } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player)
      return {
        allowed: false,
        reason: { en: "Player not found", vi: "Không tìm thấy người chơi" },
      };

    const space = BOARD_SPACES[spaceId];
    const ownership = this.state.properties.find(
      (p) => p.spaceId === spaceId && p.ownerId === playerId,
    );

    if (!space || !ownership || space.type !== "property" || !space.houseCost)
      return {
        allowed: false,
        reason: { en: "Cannot build here", vi: "Không thể xây ở đây" },
      };
    if (ownership.houses >= 5)
      return {
        allowed: false,
        reason: { en: "Max level reached", vi: "Đã đạt cấp tối đa" },
      }; // Max is hotel (5)
    if (player.money < space.houseCost)
      return {
        allowed: false,
        reason: { en: "Not enough money", vi: "Không đủ tiền" },
      };
    if (ownership.mortgaged)
      return {
        allowed: false,
        reason: { en: "Property is mortgaged", vi: "Tài sản đang thế chấp" },
      };

    // Check if owns full color set
    const colorProperties = BOARD_SPACES.filter(
      (s) => s.type === "property" && s.color === space.color,
    );
    const ownedInColor = this.state.properties.filter(
      (p) =>
        colorProperties.some((s) => s.id === p.spaceId) &&
        p.ownerId === playerId,
    );
    if (ownedInColor.length !== colorProperties.length)
      return {
        allowed: false,
        reason: { en: "Must own full color set", vi: "Phải sở hữu đủ bộ màu" },
      };

    // Must build evenly
    const minHouses = Math.min(...ownedInColor.map((p) => p.houses));
    if (ownership.houses > minHouses)
      return {
        allowed: false,
        reason: { en: "Must build evenly", vi: "Phải xây đều các ô" },
      };

    return { allowed: true };
  }

  private handleBuildHouse(playerId: string, spaceId: number): void {
    if (!this.isHost) return;

    const validation = this.canBuildHouse(playerId, spaceId);
    if (!validation.allowed) return;

    const player = this.state.players.find((p) => p.id === playerId)!;
    const space = BOARD_SPACES[spaceId];
    if (space.type !== "property" || !space.houseCost) return;

    const ownership = this.state.properties.find(
      (p) => p.spaceId === spaceId && p.ownerId === playerId,
    )!;

    player.money -= space.houseCost!;
    ownership.houses++;

    const buildingType = ownership.houses === 5 ? "hotel" : "house";
    const buildingTypeVi = ownership.houses === 5 ? "khách sạn" : "nhà";
    this.addLog(
      {
        en: `${player.username} built a ${buildingType} on ${trans(
          space?.name,
        )}`,
        vi: `${player.username} xây ${buildingTypeVi} trên ${trans(
          space?.name,
        )}`,
      },
      "action",
    );

    this.notifyAndBroadcast();
  }

  // === Payment Actions ===

  private handlePayRent(playerId: string): void {
    if (!this.isHost) return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId) return;

    const pending = this.state.pendingAction;
    if (!pending || pending.type !== "PAY_RENT") return;

    const owner = this.state.players.find((p) => p.id === pending.toPlayerId);
    if (!owner) return;

    if (player.money >= pending.amount) {
      player.money -= pending.amount;
      owner.money += pending.amount;
      this.addLog(
        {
          en: `${player.username} paid ${pending.amount}đ rent to ${owner.username}`,
          vi: `${player.username} trả ${pending.amount}đ thuê cho ${owner.username}`,
        },
        "action",
      );
    } else {
      // Bankruptcy
      this.handleBankruptcy(player, owner);
    }

    this.state.pendingAction = null;
    this.notifyAndBroadcast();
    this.checkBotTurn();
  }

  private handlePayTax(playerId: string): void {
    if (!this.isHost) return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId) return;

    const pending = this.state.pendingAction;
    if (!pending || pending.type !== "PAY_TAX") return;

    if (player.money >= pending.amount) {
      player.money -= pending.amount;
      this.addLog(
        {
          en: `${player.username} paid ${pending.amount}đ tax`,
          vi: `${player.username} đóng thuế ${pending.amount}đ`,
        },
        "action",
      );
    } else {
      this.handleBankruptcy(player, null);
    }

    this.state.pendingAction = null;
    this.notifyAndBroadcast();
    this.checkBotTurn();
  }

  private handleUseCard(playerId: string): void {
    if (!this.isHost) return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId) return;

    const pending = this.state.pendingAction;
    if (!pending || pending.type !== "CARD") return;

    const card = pending.card;
    this.state.pendingAction = null;

    switch (card.action.type) {
      case "COLLECT":
        player.money += card.action.amount;
        break;
      case "PAY":
        if (player.money >= card.action.amount) {
          player.money -= card.action.amount;
        } else {
          this.handleBankruptcy(player, null);
        }
        break;
      case "MOVE":
        const oldPos = player.position;
        player.position = card.action.position;
        if (player.position < oldPos) {
          player.money += SALARY; // Passed GO
        }
        this.handleLanding(player);
        break;
      case "MOVE_RELATIVE":
        const newPos = (player.position + card.action.spaces + 40) % 40;
        player.position = newPos;
        this.handleLanding(player);
        break;
      case "GO_TO_JAIL":
        this.sendToJail(player);
        break;
      case "GET_OUT_JAIL":
        const current = this.getOutOfJailCards.get(player.id!) || 0;
        this.getOutOfJailCards.set(player.id!, current + 1);
        break;
      case "PAY_EACH_PLAYER": {
        const activePlayers = this.state.players.filter(
          (p) => p.id && !p.isBankrupt && p.id !== player.id,
        );
        const payAmount = card.action.amount;
        const totalPay = payAmount * activePlayers.length;
        if (player.money >= totalPay) {
          player.money -= totalPay;
          activePlayers.forEach((p) => (p.money += payAmount));
        }
        break;
      }
      case "COLLECT_FROM_EACH": {
        const others = this.state.players.filter(
          (p) => p.id && !p.isBankrupt && p.id !== player.id,
        );
        const collectAmount = card.action.amount;
        others.forEach((p) => {
          if (p.money >= collectAmount) {
            p.money -= collectAmount;
            player.money += collectAmount;
          }
        });
        break;
      }
      case "REPAIRS": {
        const myProperties = this.state.properties.filter(
          (p) => p.ownerId === player.id,
        );
        const perHouse = card.action.perHouse;
        const perHotel = card.action.perHotel;
        let repairCost = 0;
        myProperties.forEach((p) => {
          if (p.houses === 5) {
            repairCost += perHotel;
          } else {
            repairCost += p.houses * perHouse;
          }
        });
        if (player.money >= repairCost) {
          player.money -= repairCost;
        } else {
          this.handleBankruptcy(player, null);
        }
        break;
      }
    }

    this.addLog(
      {
        en: `${player.username}: ${trans(card.text)}`,
        vi: `${player.username}: ${trans(card.text)}`,
      },
      "info",
    );
    this.notifyAndBroadcast();
    this.checkBotTurn();
  }

  private handlePayJailFine(playerId: string): void {
    if (!this.isHost) return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId || !player.inJail) return;

    // Check for get out of jail free card
    const freeCards = this.getOutOfJailCards.get(playerId) || 0;
    if (freeCards > 0) {
      this.getOutOfJailCards.set(playerId, freeCards - 1);
      player.inJail = false;
      player.jailTurns = 0;
      this.addLog(
        {
          en: `${player.username} used Get Out of Jail Free card`,
          vi: `${player.username} dùng thẻ Ra tù miễn phí`,
        },
        "action",
      );
    } else if (player.money >= JAIL_FINE) {
      player.money -= JAIL_FINE;
      player.inJail = false;
      player.jailTurns = 0;
      this.addLog(
        {
          en: `${player.username} paid ${JAIL_FINE}đ to leave jail`,
          vi: `${player.username} trả ${JAIL_FINE}đ để ra tù`,
        },
        "action",
      );
    }

    this.notifyAndBroadcast();
  }

  private handleBankruptcy(
    player: MonopolyPlayer,
    creditor: MonopolyPlayer | null,
  ): void {
    player.isBankrupt = true;
    this.addLog(
      {
        en: `${player.username} is bankrupt!`,
        vi: `${player.username} phá sản!`,
      },
      "alert",
    );

    // Transfer properties to creditor or back to bank
    this.state.properties = this.state.properties
      .map((p) => {
        if (p.ownerId === player.id) {
          if (creditor) {
            return { ...p, ownerId: creditor.id!, houses: 0 };
          }
          return null as any;
        }
        return p;
      })
      .filter(Boolean);

    // Transfer money
    if (creditor && player.money > 0) {
      creditor.money += player.money;
    }
    player.money = 0;

    // Check for winner
    const activePlayers = this.state.players.filter(
      (p) => p.id && !p.isBankrupt,
    );
    if (activePlayers.length === 1) {
      this.state.gamePhase = "ended";
      this.state.winner = activePlayers[0].id;
      this.addLog(
        {
          en: `${activePlayers[0].username} wins!`,
          vi: `${activePlayers[0].username} chiến thắng!`,
        },
        "alert",
      );
    } else {
      // If the current player went bankrupt and game is not over, pass the turn
      const currentPlayer = this.state.players[this.state.currentPlayerIndex];
      if (currentPlayer?.id === player.id) {
        this.endTurn();
      }
    }
  }

  private handleEndTurn(playerId: string): void {
    if (!this.isHost) return;

    const player = this.state.players[this.state.currentPlayerIndex];
    if (!player || player.id !== playerId) return;
    if (this.state.pendingAction) return;
    if (!this.state.hasRolled) return;

    // Can't end turn if can roll again (doubles)
    if (this.state.canRollAgain && !player.inJail) return;

    this.endTurn();
  }

  private endTurn(): void {
    this.state.hasRolled = false;
    this.state.canRollAgain = false;
    this.state.doublesCount = 0;
    this.state.diceValues = null;
    this.state.pendingAction = null;

    // Find next active player
    let nextIndex = (this.state.currentPlayerIndex + 1) % 4;
    let attempts = 0;
    while (attempts < 4) {
      const next = this.state.players[nextIndex];
      if (next && next.id && !next.isBankrupt) {
        break;
      }
      nextIndex = (nextIndex + 1) % 4;
      attempts++;
    }

    this.state.currentPlayerIndex = nextIndex;
    const nextPlayer = this.state.players[nextIndex];
    this.addLog(
      {
        en: `${nextPlayer?.username}'s turn`,
        vi: `Lượt của ${nextPlayer?.username}`,
      },
      "info",
    );

    this.notifyAndBroadcast();
    this.checkBotTurn();
  }

  // === Bot Logic ===

  private handleAddBot(slotIndex: number): void {
    if (!this.isHost) return;
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (this.state.players[slotIndex].id) return;

    const botId = `bot-${slotIndex}-${Date.now()}`;
    const newPlayers = [...this.state.players];
    newPlayers[slotIndex] = {
      ...newPlayers[slotIndex],
      id: botId,
      username: `Bot ${slotIndex + 1}`,
      isBot: true,
    };

    this.state = { ...this.state, players: newPlayers };
    this.notifyAndBroadcast();
  }

  private handleRemoveBot(slotIndex: number): void {
    if (!this.isHost) return;
    if (slotIndex < 0 || slotIndex >= 4) return;
    if (!this.state.players[slotIndex].isBot) return;

    const newPlayers = [...this.state.players];
    newPlayers[slotIndex] = {
      ...newPlayers[slotIndex],
      id: null,
      username: `Player ${slotIndex + 1}`,
      isBot: false,
    };

    this.state = { ...this.state, players: newPlayers };
    this.notifyAndBroadcast();
  }

  private checkBotTurn(): void {
    if (!this.isHost) return;
    if (this.state.gamePhase !== "playing") return;

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (!currentPlayer?.isBot) return;

    if (currentPlayer.isBankrupt) {
      this.endTurn();
      return;
    }

    // Delay bot actions for readability
    setTimeout(() => this.executeBotTurn(currentPlayer), 1000);
  }

  private executeBotTurn(bot: MonopolyPlayer): void {
    if (!this.isHost || this.state.gamePhase !== "playing") return;

    // RE-FETCH bot to ensure fresh state (money, position, etc.)
    const currentBot = this.state.players.find((p) => p.id === bot.id);
    if (!currentBot || currentBot.isBankrupt) return;

    // Helper to raise funds
    const tryToRaiseFunds = (amountNeeded: number) => {
      let currentMoney = currentBot.money;
      if (currentMoney >= amountNeeded) return;

      const myProperties = this.state.properties.filter(
        (p) => p.ownerId === currentBot.id,
      );

      // 1. Sell Houses first
      // Find properties with houses
      const propsWithHouses = myProperties.filter((p) => p.houses > 0);
      for (const prop of propsWithHouses) {
        if (currentMoney >= amountNeeded) break;
        // Sell until 0
        while (prop.houses > 0 && currentMoney < amountNeeded) {
          const space = BOARD_SPACES[prop.spaceId];
          this.handleSellHouse(currentBot.id!, prop.spaceId);
          currentMoney +=
            space.type === "property" && space.houseCost
              ? space.houseCost / 2
              : 0;
        }
      }

      // 2. Mortgage Properties
      if (currentMoney < amountNeeded) {
        const unmortgaged = myProperties.filter(
          (p) => !p.mortgaged && p.houses === 0,
        );
        // Sort by least price to mortgage small stuff first? Or expensive?
        // Usually mortgage expensive gives more money.
        // Let's sort by price descending to get money fast.
        unmortgaged.sort((a, b) => {
          const spaceA = BOARD_SPACES[a.spaceId];
          const spaceB = BOARD_SPACES[b.spaceId];
          const priceA =
            (spaceA.type === "property" ||
              spaceA.type === "railroad" ||
              spaceA.type === "utility") &&
            spaceA.price
              ? spaceA.price
              : 0;
          const priceB =
            (spaceB.type === "property" ||
              spaceB.type === "railroad" ||
              spaceB.type === "utility") &&
            spaceB.price
              ? spaceB.price
              : 0;
          return priceB - priceA;
        });

        for (const prop of unmortgaged) {
          if (currentMoney >= amountNeeded) break;
          const space = BOARD_SPACES[prop.spaceId];
          this.handleMortgage(currentBot.id!, prop.spaceId);
          currentMoney +=
            (space.type === "property" ||
              space.type === "railroad" ||
              space.type === "utility") &&
            space.price
              ? space.price / 2
              : 0;
        }
      }
    };

    // Handle pending actions first
    if (this.state.pendingAction) {
      switch (this.state.pendingAction.type) {
        case "BUY_DECISION":
          const space = BOARD_SPACES[this.state.pendingAction.spaceId];
          // Bot buys if it has enough money and some buffer
          // Buffer calculation: Keep at least 500 or 10% of current money
          const buyBuffer = 1000;
          if (
            space.type === "property" &&
            space?.price &&
            currentBot.money >= space.price + buyBuffer
          ) {
            this.handleBuyProperty(
              currentBot.id!,
              this.state.pendingAction.spaceId,
            );
          } else {
            this.handleDeclineProperty(currentBot.id!);
          }
          return;

        case "PAY_RENT":
          tryToRaiseFunds(this.state.pendingAction.amount);
          this.handlePayRent(currentBot.id!);
          return;

        case "PAY_TAX":
          tryToRaiseFunds(this.state.pendingAction.amount);
          this.handlePayTax(currentBot.id!);
          return;

        case "CARD":
          // Some cards require payment, but handleUseCard internal logic checks money.
          // However, handleUseCard calls handleBankruptcy if strict payment fails.
          // We can't easily predict amount here unless we parse card.
          // For now, let handleUseCard do its thing, or improve it later.
          // Actually, if it's a PAY card, we might want to check.
          // But card action details are in the card object.
          const card = this.state.pendingAction.card;
          if (card.action.type === "PAY") {
            tryToRaiseFunds(card.action.amount);
          } else if (card.action.type === "PAY_EACH_PLAYER") {
            const count = this.state.players.filter(
              (p) => p.id && !p.isBankrupt && p.id !== currentBot.id,
            ).length;
            tryToRaiseFunds(card.action.amount * count);
          } else if (card.action.type === "REPAIRS") {
            // Complex calc, skip for now or implementing would be good.
          }
          this.handleUseCard(currentBot.id!);
          return;
      }
    }

    // Pay jail fine if in jail and has money
    if (
      currentBot.inJail &&
      currentBot.money >= JAIL_FINE + 500 &&
      !this.state.hasRolled
    ) {
      this.handlePayJailFine(currentBot.id!);
      setTimeout(() => this.executeBotTurn(currentBot), 500);
      return;
    }

    // Roll dice if can
    if (!this.state.hasRolled || this.state.canRollAgain) {
      this.handleRollDice(currentBot.id!);
      setTimeout(() => this.executeBotTurn(currentBot), 1500);
      return;
    }

    // Try to build houses
    const myProperties = this.state.properties.filter(
      (p) => p.ownerId === currentBot.id,
    );
    // Shuffle properties to build randomly or iterate? Standard iteration is fine.
    for (const prop of myProperties) {
      const space = BOARD_SPACES[prop.spaceId];
      if (
        space &&
        space.type === "property" &&
        space.houseCost &&
        space.color &&
        prop.houses < 5 &&
        !prop.mortgaged
      ) {
        const colorProps = BOARD_SPACES.filter(
          (s) => s.type === "property" && s.color === space.color,
        );
        const ownedInColor = myProperties.filter((p) =>
          colorProps.some((c) => c.id === p.spaceId),
        );

        // Check local validation first
        const validation = this.canBuildHouse(currentBot.id!, prop.spaceId);

        // STRICTER BUFFER: House Cost + 3000 buffer
        if (
          ownedInColor.length === colorProps.length &&
          space.type === "property" &&
          space.houseCost &&
          currentBot.money >= space.houseCost + 3000 &&
          validation.allowed
        ) {
          this.handleBuildHouse(currentBot.id!, prop.spaceId);
          setTimeout(() => this.executeBotTurn(currentBot), 500);
          return;
        }
      }
    }

    // End turn
    if (!this.state.pendingAction && !this.state.canRollAgain) {
      this.handleEndTurn(currentBot.id!);
    }
  }

  // === Request Methods (Client -> Host) ===

  requestRollDice(): void {
    this.makeAction({ type: "ROLL_DICE", playerId: this.userId });
  }

  requestBuyProperty(spaceId: number): void {
    this.makeAction({ type: "BUY_PROPERTY", playerId: this.userId, spaceId });
  }

  requestDeclineProperty(): void {
    this.makeAction({ type: "DECLINE_PROPERTY", playerId: this.userId });
  }

  requestBuildHouse(spaceId: number): void {
    this.makeAction({ type: "BUILD_HOUSE", playerId: this.userId, spaceId });
  }

  requestPayRent(): void {
    this.makeAction({ type: "PAY_RENT", playerId: this.userId });
  }

  requestPayTax(): void {
    this.makeAction({ type: "PAY_TAX", playerId: this.userId });
  }

  requestUseCard(): void {
    this.makeAction({ type: "USE_CARD", playerId: this.userId });
  }

  requestPayJailFine(): void {
    this.makeAction({ type: "PAY_JAIL_FINE", playerId: this.userId });
  }

  requestEndTurn(): void {
    this.makeAction({ type: "END_TURN", playerId: this.userId });
  }

  requestStartGame(): void {
    this.makeAction({ type: "START_GAME" });
  }

  requestAddBot(slotIndex: number): void {
    this.makeAction({ type: "ADD_BOT", slotIndex });
  }

  requestRemoveBot(slotIndex: number): void {
    this.makeAction({ type: "REMOVE_BOT", slotIndex });
  }

  requestOfferTrade(toPlayerId: string, spaceId: number, price: number): void {
    this.makeAction({
      type: "OFFER_TRADE",
      fromPlayerId: this.userId,
      toPlayerId,
      spaceId,
      price,
    });
  }

  requestRespondTrade(
    offerId: string,
    accepted: boolean,
    message?: string,
  ): void {
    this.makeAction({
      type: "RESPOND_TRADE",
      offerId,
      accepted,
      message,
    });
  }

  requestResetGame(): void {
    if (this.isHost) {
      this.makeAction({ type: "RESET_GAME" });
    }
  }

  requestCancelTrade(offerId: string): void {
    this.makeAction({ type: "CANCEL_TRADE", offerId });
  }

  requestSellHouse(spaceId: number): void {
    this.makeAction({
      type: "SELL_HOUSE",
      playerId: this.userId,
      spaceId,
    });
  }

  requestMortgage(spaceId: number): void {
    this.makeAction({
      type: "MORTGAGE",
      playerId: this.userId,
      spaceId,
    });
  }

  requestUnmortgage(spaceId: number): void {
    this.makeAction({
      type: "UNMORTGAGE",
      playerId: this.userId,
      spaceId,
    });
  }

  // === Utility Methods ===

  reset(): void {
    this.state.players.forEach((p) => {
      if (p.id) {
        p.position = 0;
        p.money = START_MONEY;
        p.inJail = false;
        p.jailTurns = 0;
        p.isBankrupt = false;
        p.moneyHistory = [START_MONEY];
      }
    });
    this.state.properties = [];
    this.state.currentPlayerIndex = this.findFirstActivePlayer();
    this.state.diceValues = null;
    this.state.doublesCount = 0;
    this.state.hasRolled = false;
    this.state.canRollAgain = false;
    this.state.gamePhase = "waiting";
    this.state.winner = null;
    this.state.pendingAction = null;
    this.state.logs = [];
    this.addLog(
      {
        en: "Game reset!",
        vi: "Trò chơi được đặt lại!",
      },
      "info",
    );
    this.getOutOfJailCards.clear();
    this.chanceCards = [...CHANCE_CARDS].sort(() => Math.random() - 0.5);
    this.chestCards = [...CHEST_CARDS].sort(() => Math.random() - 0.5);

    this.notifyAndBroadcast();
  }

  updatePlayers(players: Player[]): void {
    // Reset human slots first to ensure sync
    this.state.players.forEach((p, i) => {
      if (!p.isBot) {
        p.id = null;
        p.username = `Player ${i + 1}`;
      }
    });

    // Fill non-bot slots with available players
    let playerIndex = 0;
    for (let i = 0; i < 4; i++) {
      if (playerIndex >= players.length) break;

      if (!this.state.players[i].isBot) {
        this.state.players[i].id = players[playerIndex].id;
        this.state.players[i].username = players[playerIndex].username;
        playerIndex++;
      }
    }

    this.syncState();
  }

  getMyPlayerIndex(): number {
    return this.state.players.findIndex((p) => p.id === this.userId);
  }

  canStartGame(): boolean {
    const activePlayers = this.state.players.filter((p) => p.id !== null);
    return activePlayers.length >= 2;
  }

  getPlayerProperties(playerId: string): OwnedProperty[] {
    return this.state.properties.filter((p) => p.ownerId === playerId);
  }
}
