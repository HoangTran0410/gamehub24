// === Cờ Tỷ Phú (Monopoly) Types ===

// Property colors (8 color groups)
export type PropertyColor =
  | "brown"
  | "lightblue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "blue";

// Types of board spaces
export type SpaceType =
  | "go"
  | "property"
  | "railroad"
  | "utility"
  | "tax"
  | "chance"
  | "chest"
  | "jail"
  | "parking"
  | "gotojail";

// Board space interface
// Base interface for all spaces
interface BaseSpace {
  id: number;
  name: string | { en: string; vi: string };
  description?: string | { en: string; vi: string };
  type: SpaceType;
}

// 1. Color Property
export interface PropertySpace extends BaseSpace {
  type: "property";
  color: PropertyColor;
  price: number;
  rent: number[]; // [base, 1house, 2house, 3house, 4house, hotel]
  houseCost: number;
}

// 2. Railroad
export interface RailroadSpace extends BaseSpace {
  type: "railroad";
  price: number;
  baseRent: number;
}

// 3. Utility
export interface UtilitySpace extends BaseSpace {
  type: "utility";
  price: number;
  baseRent: number; // multiplier
}

// 4. Tax
export interface TaxSpace extends BaseSpace {
  type: "tax";
  taxAmount: number;
}

// 5. Action/Corner Spaces (Go, Jail, etc)
export interface OtherSpace extends BaseSpace {
  type: "go" | "chance" | "chest" | "jail" | "parking" | "gotojail";
}

export type BoardSpace =
  | PropertySpace
  | RailroadSpace
  | UtilitySpace
  | TaxSpace
  | OtherSpace;

// Property ownership
export interface OwnedProperty {
  spaceId: number;
  ownerId: string;
  houses: number; // 0-4 houses, 5 = hotel
  mortgaged: boolean;
}

// Player interface
export interface MonopolyPlayer {
  id: string | null;
  username: string;
  color: string; // Token color
  position: number; // 0-39
  money: number;
  inJail: boolean;
  jailTurns: number;
  isBankrupt: boolean;
  isBot: boolean;
}

// Chance/Community Chest cards
export interface Card {
  id: number;
  text: string | { en: string; vi: string };
  action: CardAction;
}

export type CardAction =
  | { type: "COLLECT"; amount: number }
  | { type: "PAY"; amount: number }
  | { type: "MOVE"; position: number }
  | { type: "MOVE_RELATIVE"; spaces: number }
  | { type: "GO_TO_JAIL" }
  | { type: "GET_OUT_JAIL" }
  | { type: "PAY_EACH_PLAYER"; amount: number }
  | { type: "COLLECT_FROM_EACH"; amount: number }
  | { type: "REPAIRS"; perHouse: number; perHotel: number };

// Game Log interface
export interface GameLog {
  id: string;
  message: string | { en: string; vi: string };
  type: "info" | "action" | "alert";
  timestamp: number;
}

// Main game state
export interface MonopolyState {
  players: MonopolyPlayer[];
  currentPlayerIndex: number;
  properties: OwnedProperty[];
  diceValues: [number, number] | null;
  doublesCount: number; // Consecutive doubles rolled
  hasRolled: boolean;
  canRollAgain: boolean;
  gamePhase: "waiting" | "playing" | "ended";
  winner: string | null;
  pendingAction:
    | null
    | { type: "BUY_DECISION"; spaceId: number }
    | { type: "PAY_RENT"; amount: number; toPlayerId: string }
    | { type: "PAY_TAX"; amount: number }
    | { type: "CARD"; card: Card };
  lastAction: string | { en: string; vi: string } | null; // Description of last action for UI
  logs: GameLog[];
  tradeOffers: TradeOffer[];
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  propertyId: number; // Space ID
  price: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  responseMessage?: { en: string; vi: string };
}

// === Actions ===
export interface RollDiceAction {
  type: "ROLL_DICE";
  playerId: string;
}

export interface BuyPropertyAction {
  type: "BUY_PROPERTY";
  playerId: string;
  spaceId: number;
}

export interface DeclinePropertyAction {
  type: "DECLINE_PROPERTY";
  playerId: string;
}

export interface BuildHouseAction {
  type: "BUILD_HOUSE";
  playerId: string;
  spaceId: number;
}

export interface SellHouseAction {
  type: "SELL_HOUSE";
  playerId: string;
  spaceId: number;
}

export interface MortgageAction {
  type: "MORTGAGE";
  playerId: string;
  spaceId: number;
}

export interface UnmortgageAction {
  type: "UNMORTGAGE";
  playerId: string;
  spaceId: number;
}

export interface PayRentAction {
  type: "PAY_RENT";
  playerId: string;
}

export interface PayTaxAction {
  type: "PAY_TAX";
  playerId: string;
}

export interface UseCardAction {
  type: "USE_CARD";
  playerId: string;
}

export interface PayJailFineAction {
  type: "PAY_JAIL_FINE";
  playerId: string;
}

export interface EndTurnAction {
  type: "END_TURN";
  playerId: string;
}

export interface StartGameAction {
  type: "START_GAME";
}

export interface AddBotAction {
  type: "ADD_BOT";
  slotIndex: number;
}

export interface RemoveBotAction {
  type: "REMOVE_BOT";
  slotIndex: number;
}

export interface RequestSyncAction {
  type: "REQUEST_SYNC";
}

export interface OfferTradeAction {
  type: "OFFER_TRADE";
  fromPlayerId: string;
  toPlayerId: string;
  spaceId: number;
  price: number;
}

export interface RespondTradeAction {
  type: "RESPOND_TRADE";
  offerId: string;
  accepted: boolean;
  message?: string;
}

export interface CancelTradeAction {
  type: "CANCEL_TRADE";
  offerId: string;
}

export type MonopolyAction =
  | RollDiceAction
  | BuyPropertyAction
  | DeclinePropertyAction
  | BuildHouseAction
  | SellHouseAction
  | MortgageAction
  | UnmortgageAction
  | PayRentAction
  | PayTaxAction
  | UseCardAction
  | PayJailFineAction
  | EndTurnAction
  | StartGameAction
  | AddBotAction
  | RemoveBotAction
  | RequestSyncAction
  | OfferTradeAction
  | RespondTradeAction
  | CancelTradeAction
  | ResetGameAction;

export interface ResetGameAction {
  type: "RESET_GAME";
}

// === Constants ===
export const START_MONEY = 30000;
export const SALARY = 2000;
export const JAIL_FINE = 500;
export const MAX_JAIL_TURNS = 3;
export const MAX_HOUSES = 4;
export const MAX_PLAYERS = 4;

// Player token colors
export const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];

// === Board Spaces (40 spaces, clockwise from GO) ===
export const BOARD_SPACES: BoardSpace[] = [
  // Bottom row (right to left when viewing)
  {
    id: 0,
    name: { en: "GO", vi: "KHỞI HÀNH" },
    type: "go",
    description: {
      en: "Passing here earns you " + SALARY,
      vi: "Đi qua đây bạn sẽ nhận được " + SALARY,
    },
  },
  {
    id: 1,
    name: { en: "Hang Bai", vi: "Hàng Bài" },
    type: "property",
    color: "brown",
    price: 600,
    rent: [20, 100, 300, 900, 1600, 2500],
    houseCost: 500,
  },
  { id: 2, name: { en: "Community Chest", vi: "Cộng Đồng" }, type: "chest" },
  {
    id: 3,
    name: { en: "Hang Dao", vi: "Hàng Đào" },
    type: "property",
    color: "brown",
    price: 600,
    rent: [40, 200, 600, 1800, 3200, 4500],
    houseCost: 500,
  },
  {
    id: 4,
    name: { en: "Income Tax", vi: "Thuế Thu Nhập" },
    type: "tax",
    taxAmount: 2000,
  },
  {
    id: 5,
    name: { en: "Ga Ha Noi", vi: "Ga Hà Nội" },
    type: "railroad",
    price: 2000,
    baseRent: 250,
  },
  {
    id: 6,
    name: { en: "Hang Gai", vi: "Hàng Gai" },
    type: "property",
    color: "lightblue",
    price: 1000,
    rent: [60, 300, 900, 2700, 4000, 5500],
    houseCost: 500,
  },
  { id: 7, name: { en: "Chance", vi: "Cơ Hội" }, type: "chance" },
  {
    id: 8,
    name: { en: "Hang Bong", vi: "Hàng Bông" },
    type: "property",
    color: "lightblue",
    price: 1000,
    rent: [60, 300, 900, 2700, 4000, 5500],
    houseCost: 500,
  },
  {
    id: 9,
    name: { en: "Hang Ma", vi: "Hàng Mã" },
    type: "property",
    color: "lightblue",
    price: 1200,
    rent: [80, 400, 1000, 3000, 4500, 6000],
    houseCost: 500,
  },
  // Left column (bottom to top)
  {
    id: 10,
    name: { en: "Jail", vi: "Nhà Tù" },
    type: "jail",
    description: {
      en:
        "If you pass it: Nothing happen.\nIf you are in jail: Pay " +
        JAIL_FINE +
        "đ, or roll double, or use a card, or wait " +
        MAX_JAIL_TURNS +
        " turns to leave jail",
      vi:
        "Nếu đi qua (thăm tù): Không sao.\nNếu trong tù: Nộp tiền " +
        JAIL_FINE +
        "đ, hoặc đổ đôi, hoặc dùng thẻ, hoặc chờ " +
        MAX_JAIL_TURNS +
        " lượt để ra tù.",
    },
  },
  {
    id: 11,
    name: { en: "Pho Hue", vi: "Phố Huế" },
    type: "property",
    color: "pink",
    price: 1400,
    rent: [100, 500, 1500, 4500, 6250, 7500],
    houseCost: 1000,
  },
  {
    id: 12,
    name: { en: "Electric Company", vi: "Công Ty Điện" },
    type: "utility",
    price: 1500,
    baseRent: 40, // 4x or 10x dice roll
  },
  {
    id: 13,
    name: { en: "Ba Trieu", vi: "Bà Triệu" },
    type: "property",
    color: "pink",
    price: 1400,
    rent: [100, 500, 1500, 4500, 6250, 7500],
    houseCost: 1000,
  },
  {
    id: 14,
    name: { en: "Trang Tien", vi: "Tràng Tiền" },
    type: "property",
    color: "pink",
    price: 1600,
    rent: [120, 600, 1800, 5000, 7000, 9000],
    houseCost: 1000,
  },
  {
    id: 15,
    name: { en: "Ga Sai Gon", vi: "Ga Sài Gòn" },
    type: "railroad",
    price: 2000,
    baseRent: 250,
  },
  {
    id: 16,
    name: { en: "Le Loi", vi: "Lê Lợi" },
    type: "property",
    color: "orange",
    price: 1800,
    rent: [140, 700, 2000, 5500, 7500, 9500],
    houseCost: 1000,
  },
  { id: 17, name: { en: "Community Chest", vi: "Cộng Đồng" }, type: "chest" },
  {
    id: 18,
    name: { en: "Ham Nghi", vi: "Hàm Nghi" },
    type: "property",
    color: "orange",
    price: 1800,
    rent: [140, 700, 2000, 5500, 7500, 9500],
    houseCost: 1000,
  },
  {
    id: 19,
    name: { en: "Nguyen Hue", vi: "Nguyễn Huệ" },
    type: "property",
    color: "orange",
    price: 2000,
    rent: [160, 800, 2200, 6000, 8000, 10000],
    houseCost: 1000,
  },
  // Top row (left to right)
  {
    id: 20,
    name: { en: "Free Parking", vi: "Đỗ Xe Miễn Phí" },
    description: {
      en: "Nothing happens here.",
      vi: "Chỉ là chỗ nghỉ, không có tác dụng",
    },
    type: "parking",
  },
  {
    id: 21,
    name: { en: "Dong Khoi", vi: "Đồng Khởi" },
    type: "property",
    color: "red",
    price: 2200,
    rent: [180, 900, 2500, 7000, 8750, 10500],
    houseCost: 1500,
  },
  { id: 22, name: { en: "Chance", vi: "Cơ Hội" }, type: "chance" },
  {
    id: 23,
    name: { en: "Le Thanh Ton", vi: "Lê Thánh Tôn" },
    type: "property",
    color: "red",
    price: 2200,
    rent: [180, 900, 2500, 7000, 8750, 10500],
    houseCost: 1500,
  },
  {
    id: 24,
    name: { en: "Hai Ba Trung", vi: "Hai Bà Trưng" },
    type: "property",
    color: "red",
    price: 2400,
    rent: [200, 1000, 3000, 7500, 9250, 11000],
    houseCost: 1500,
  },
  {
    id: 25,
    name: { en: "Ga Da Nang", vi: "Ga Đà Nẵng" },
    type: "railroad",
    price: 2000,
    baseRent: 250,
  },
  {
    id: 26,
    name: { en: "Phan Boi Chau", vi: "Phan Bội Châu" },
    type: "property",
    color: "yellow",
    price: 2600,
    rent: [220, 1100, 3300, 8000, 9750, 11500],
    houseCost: 1500,
  },
  {
    id: 27,
    name: { en: "Phan Chu Trinh", vi: "Phan Chu Trinh" },
    type: "property",
    color: "yellow",
    price: 2600,
    rent: [220, 1100, 3300, 8000, 9750, 11500],
    houseCost: 1500,
  },
  {
    id: 28,
    name: { en: "Water Works", vi: "Công Ty Nước" },
    type: "utility",
    price: 1500,
    baseRent: 40,
  },
  {
    id: 29,
    name: { en: "Ly Thai To", vi: "Lý Thái Tổ" },
    type: "property",
    color: "yellow",
    price: 2800,
    rent: [240, 1200, 3600, 8500, 10250, 12000],
    houseCost: 1500,
  },
  // Right column (top to bottom)
  {
    id: 30,
    name: { en: "Go To Jail", vi: "Vào Tù" },
    type: "gotojail",
    description: {
      en: "Move to Jail cell",
      vi: "Được chuyển đến ô Nhà Tù",
    },
  },
  {
    id: 31,
    name: { en: "Tran Hung Dao", vi: "Trần Hưng Đạo" },
    type: "property",
    color: "green",
    price: 3000,
    rent: [260, 1300, 3900, 9000, 11000, 12750],
    houseCost: 2000,
  },
  {
    id: 32,
    name: { en: "Dien Bien Phu", vi: "Điện Biên Phủ" },
    type: "property",
    color: "green",
    price: 3000,
    rent: [260, 1300, 3900, 9000, 11000, 12750],
    houseCost: 2000,
  },
  { id: 33, name: { en: "Community Chest", vi: "Cộng Đồng" }, type: "chest" },
  {
    id: 34,
    name: { en: "Le Duan", vi: "Lê Duẩn" },
    type: "property",
    color: "green",
    price: 3200,
    rent: [280, 1500, 4500, 10000, 12000, 14000],
    houseCost: 2000,
  },
  {
    id: 35,
    name: { en: "Ga Hue", vi: "Ga Huế" },
    type: "railroad",
    price: 2000,
    baseRent: 250,
  },
  { id: 36, name: { en: "Chance", vi: "Cơ Hội" }, type: "chance" },
  {
    id: 37,
    name: { en: "Phu My Hung", vi: "Phú Mỹ Hưng" },
    type: "property",
    color: "blue",
    price: 3500,
    rent: [350, 1750, 5000, 11000, 13000, 15000],
    houseCost: 2000,
  },
  {
    id: 38,
    name: { en: "Luxury Tax", vi: "Thuế Xa Xỉ" },
    type: "tax",
    taxAmount: 1000,
  },
  {
    id: 39,
    name: { en: "Thu Thiem", vi: "Thủ Thiêm" },
    type: "property",
    color: "blue",
    price: 4000,
    rent: [500, 2000, 6000, 14000, 17000, 20000],
    houseCost: 2000,
  },
];

// Property color display colors
export const PROPERTY_COLORS: Record<PropertyColor, string> = {
  brown: "#8B4513",
  lightblue: "#87CEEB",
  pink: "#FF69B4",
  orange: "#FFA500",
  red: "#FF0000",
  yellow: "#FFD700",
  green: "#228B22",
  blue: "#0000CD",
};

// Chance cards
export const CHANCE_CARDS: Card[] = [
  {
    id: 1,
    text: { en: "Advance to GO", vi: "Đi đến ô Khởi Hành" },
    action: { type: "MOVE", position: 0 },
  },
  {
    id: 2,
    text: { en: "Go to Jail", vi: "Đi vào Tù" },
    action: { type: "GO_TO_JAIL" },
  },
  {
    id: 3,
    text: { en: "Bank pays you 500đ", vi: "Ngân hàng trả bạn 500đ" },
    action: { type: "COLLECT", amount: 500 },
  },
  {
    id: 4,
    text: { en: "Pay 150đ fine", vi: "Nộp phạt 150đ" },
    action: { type: "PAY", amount: 150 },
  },
  {
    id: 5,
    text: { en: "Advance to Đồng Khởi", vi: "Đi đến Đồng Khởi" },
    action: { type: "MOVE", position: 21 },
  },
  {
    id: 6,
    text: { en: "Go back 3 spaces", vi: "Lùi 3 ô" },
    action: { type: "MOVE_RELATIVE", spaces: -3 },
  },
  {
    id: 7,
    text: { en: "Pay each player 500đ", vi: "Trả mỗi người chơi 500đ" },
    action: { type: "PAY_EACH_PLAYER", amount: 500 },
  },
  {
    id: 8,
    text: { en: "Collect 1500đ", vi: "Nhận 1500đ" },
    action: { type: "COLLECT", amount: 1500 },
  },
  {
    id: 9,
    text: { en: "Get out of jail free", vi: "Ra tù miễn phí" },
    action: { type: "GET_OUT_JAIL" },
  },
  {
    id: 10,
    text: {
      en: "Repairs: 250đ/house, 1000đ/hotel",
      vi: "Sửa chữa: 250đ/nhà, 1000đ/khách sạn",
    },
    action: { type: "REPAIRS", perHouse: 250, perHotel: 1000 },
  },
  {
    id: 11,
    text: { en: "Advance to Ham Nghi", vi: "Đi đến Hàm Nghi" },
    action: { type: "MOVE", position: 18 },
  },
  {
    id: 12,
    text: { en: "Advance to Tran Hung Dao", vi: "Đi đến Trần Hưng Đạo" },
    action: { type: "MOVE", position: 31 },
  },
  {
    id: 13,
    text: { en: "Advance to Thu Thiem", vi: "Đi đến Thủ Thiêm" },
    action: { type: "MOVE", position: 39 },
  },
  {
    id: 14,
    text: {
      en: "Drunk driving fine. Pay 200đ",
      vi: "Phạt lái xe khi say. Trả 200đ",
    },
    action: { type: "PAY", amount: 200 },
  },
  {
    id: 15,
    text: {
      en: "Won crossword competition. Collect 1000đ",
      vi: "Thắng giải ô chữ. Nhận 1000đ",
    },
    action: { type: "COLLECT", amount: 1000 },
  },
];

// Community Chest cards
export const CHEST_CARDS: Card[] = [
  {
    id: 1,
    text: { en: "Advance to GO", vi: "Đi đến ô Khởi Hành" },
    action: { type: "MOVE", position: 0 },
  },
  {
    id: 2,
    text: { en: "Bank error, collect 2000đ", vi: "Lỗi ngân hàng, nhận 2000đ" },
    action: { type: "COLLECT", amount: 2000 },
  },
  {
    id: 3,
    text: { en: "Doctor's fee, pay 500đ", vi: "Phí bác sĩ, trả 500đ" },
    action: { type: "PAY", amount: 500 },
  },
  {
    id: 4,
    text: { en: "Sale of stock, get 500đ", vi: "Bán cổ phiếu, nhận 500đ" },
    action: { type: "COLLECT", amount: 500 },
  },
  {
    id: 5,
    text: { en: "Get out of jail free", vi: "Ra tù miễn phí" },
    action: { type: "GET_OUT_JAIL" },
  },
  {
    id: 6,
    text: { en: "Go to Jail", vi: "Đi vào Tù" },
    action: { type: "GO_TO_JAIL" },
  },
  {
    id: 7,
    text: {
      en: "Birthday! Collect 100đ from each",
      vi: "Sinh nhật! Nhận 100đ từ mỗi người",
    },
    action: { type: "COLLECT_FROM_EACH", amount: 100 },
  },
  {
    id: 8,
    text: { en: "Income tax refund, get 200đ", vi: "Hoàn thuế, nhận 200đ" },
    action: { type: "COLLECT", amount: 200 },
  },
  {
    id: 9,
    text: { en: "Pay hospital, 1000đ", vi: "Trả viện phí, 1000đ" },
    action: { type: "PAY", amount: 1000 },
  },
  {
    id: 10,
    text: { en: "Inherit 1000đ", vi: "Thừa kế 1000đ" },
    action: { type: "COLLECT", amount: 1000 },
  },
  {
    id: 11,
    text: {
      en: "Life insurance matures. Collect 1000đ",
      vi: "Đáo hạn bảo hiểm nhân thọ. Nhận 1000đ",
    },
    action: { type: "COLLECT", amount: 1000 },
  },
  {
    id: 12,
    text: { en: "Pay school fees 1500đ", vi: "Nộp học phí 1500đ" },
    action: { type: "PAY", amount: 1500 },
  },
  {
    id: 13,
    text: {
      en: "Receive consultancy fee. Collect 250đ",
      vi: "Nhận tiền tư vấn. Nhận 250đ",
    },
    action: { type: "COLLECT", amount: 250 },
  },
  {
    id: 14,
    text: {
      en: "Street repairs: 400đ/house, 1150đ/hotel",
      vi: "Tu sửa đường phố: 400đ/nhà, 1150đ/khách sạn",
    },
    action: { type: "REPAIRS", perHouse: 400, perHotel: 1150 },
  },
];
