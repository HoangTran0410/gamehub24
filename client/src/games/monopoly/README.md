# Monopoly Game Documentation

This directory contains the implementation of the Monopoly game module. It is built using React (frontend) and Socket.IO (real-time communication), following a **Host-Server-Client** architecture where the Host maintains the authoritative game state and broadcasts it to other clients.

## Architecture Overview

-   **Monopoly.ts**: Core game logic, state management, and socket event handling.
-   **MonopolyUI.tsx**: React component for rendering the game board and UI.
-   **types.ts**: TypeScript definitions for game state, players, properties, and cards.

## Game Flows

### 1. Game Initialization & Start

The game starts in a "waiting" phase. The Host adds/removes bots or waits for players. Once started, the phase shifts to "playing".

```mermaid
sequenceDiagram
    participant Host
    participant Server
    participant Guest

    Note over Host: GamePhase: "waiting"
    Host->>Server: Action: START_GAME
    Server->>Guest: Broadcast Action: START_GAME

    Note over Host: Initialize State (Money, Positions)
    Host->>Host: Determine Starting Player
    Host->>Host: GamePhase = "playing"

    Host->>Server: Emit game:state (Full Sync)
    Server->>Guest: Receive game:state

    Note over Guest: Update UI to "Playing"
```

### 2. Player Turn Flow

A standard turn involves rolling dice, moving, handling the landing space, and ending the turn.

```mermaid
flowchart TD
    Start([Start Turn]) --> CheckJail{In Jail?}

    CheckJail -- Yes --> JailOptions[Roll Doubles / Pay Fine / Use Card]
    JailOptions --> RolledDoubles{Doubles?}
    RolledDoubles -- Yes --> MoveToken
    RolledDoubles -- No --> EndTurn

    CheckJail -- No --> RollDice[Roll Dice]
    RollDice --> Animation[UI Animation]
    Animation --> MoveToken[Move Token]

    MoveToken --> LandOnSpace[Land on Space]
    LandOnSpace --> SpaceType{Space Type?}

    SpaceType -- Property --> PropLogic[Property Logic]
    SpaceType -- Chance/Chest --> DrawCard[Draw Card]
    SpaceType -- Tax --> PayTax[Pay Tax]
    SpaceType -- GoToJail --> SendToJail

    PropLogic --> CheckActions{Pending Actions?}
    DrawCard --> CheckActions
    PayTax --> CheckActions

    CheckActions -- Buy Decision --> Buy/Pass
    CheckActions -- Pay Rent --> Pay
    CheckActions -- None --> CanRollAgain{Doubles?}

    Buy/Pass --> CanRollAgain
    Pay --> CanRollAgain

    CanRollAgain -- Yes --> RollDice
    CanRollAgain -- No --> EndTurn([End Turn & Sync])
```

### 3. Property Interaction Logic

When a player lands on a property (Street, Railroad, Utility), the following logic applies:

```mermaid
flowchart LR
    Land[Land on Property] --> Owned{Owned?}

    Owned -- No --> Afford{Can Afford?}
    Afford -- Yes --> Prompt[Prompt Buy/Decline]
    Afford -- No --> Alert[Alert: Not enough money]

    Owned -- Yes --> IsMyOwn{Is My Own?}
    IsMyOwn -- Yes --> Relax[Relax / Build Houses]
    IsMyOwn -- No --> Mortgaged{Mortgaged?}

    Mortgaged -- Yes --> Free[No Rent]
    Mortgaged -- No --> Rent[Calculate & Pay Rent]
```

### 4. Trading System

Trading allows players to exchange properties for money.

```mermaid
sequenceDiagram
    participant P1 as Initiator
    participant Host
    participant P2 as Target

    P1->>Host: Action: OFFER_TRADE (Property, Price)
    Host->>Host: Validate Offer
    Host->>Host: Add to State

    Host->>P2: Sync State (Show Offer Modal)

    alt Accept
        P2->>Host: Action: RESPOND_TRADE (Accepted)
        Host->>Host: Check P1 Money / P2 Property
        Host->>Host: Transfer Owner & Money
        Host->>All: Log Success & Sync
    else Decline
        P2->>Host: Action: RESPOND_TRADE (Declined)
        Host->>P1: Log DeclineMsg
    end
```

### 5. Bot Logic (Host Side)

Bots are controlled entirely by the Host's browser instance.

```mermaid
stateDiagram-v2
    [*] --> CheckTurn
    CheckTurn --> IsBotTurn: Current Player is Bot?

    state IsBotTurn {
        [*] --> EvaluateState

        EvaluateState --> ResolvePending: Pending Action?
        ResolvePending --> DecideBuy: Buy Decision
        ResolvePending --> AutoPay: Pay Rent/Tax

        EvaluateState --> RollDice: Can Roll?

        EvaluateState --> Management: Owns Properties?
        Management --> BuildHouse: Has Monoploy & Money?

        EvaluateState --> EndTurn: No Actions Left
    }
```
