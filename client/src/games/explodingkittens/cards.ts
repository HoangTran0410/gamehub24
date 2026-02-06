import {
  ArrowDown,
  Atom,
  Ban,
  Bomb,
  Cat,
  Crosshair,
  Eye,
  RotateCcw,
  Shield,
  ShuffleIcon,
  SkipForward,
  Swords,
  Sparkles,
  Sparkle,
  Sword,
  Heart,
  Shovel,
} from "lucide-react";
import { EKCardType } from "./types";

interface EKCardConfig {
  name: { en: string; vi: string };
  description: { en: string; vi: string };
  icon: any;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  textColor: string;
  isCombo?: boolean;
}

export const CARD_CONFIG: Record<EKCardType, EKCardConfig> = {
  [EKCardType.EXPLODING_KITTEN]: {
    name: { en: "EXPLODING KITTEN", vi: "MÈO NỔ" },
    description: {
      en: "You explode! Unless you have a Defuse.",
      vi: "Bạn nổ tung! Trừ khi bạn có lá Gỡ Bom.",
    },
    icon: Bomb,
    bgColor: "bg-red-600",
    borderColor: "border-red-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.DEFUSE]: {
    name: { en: "DEFUSE", vi: "GỠ BOM" },
    description: {
      en: "Save yourself from a kitten.",
      vi: "Cứu bản thân khỏi mèo nổ.",
    },
    icon: Shield,
    bgColor: "bg-green-600",
    borderColor: "border-green-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.ATTACK]: {
    name: { en: "ATTACK", vi: "TẤN CÔNG" },
    description: {
      en: "End your turn and force next player to take 2 turns.",
      vi: "Kết thúc lượt và bắt người chơi sau đi 2 lượt.",
    },
    icon: Sword,
    bgColor: "bg-orange-600",
    borderColor: "border-orange-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.SKIP]: {
    name: { en: "SKIP", vi: "BỎ LƯỢT" },
    description: {
      en: "End your turn without drawing a card.",
      vi: "Kết thúc lượt mà không cần rút bài.",
    },
    icon: SkipForward,
    bgColor: "bg-blue-600",
    borderColor: "border-blue-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.FAVOR]: {
    name: { en: "FAVOR", vi: "THIỆN Ý" },
    description: {
      en: "Choose a player to give you a card.",
      vi: "Chọn một người chơi để lấy 1 lá bài từ họ.",
    },
    icon: Heart,
    bgColor: "bg-pink-600",
    borderColor: "border-pink-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.SHUFFLE]: {
    name: { en: "SHUFFLE", vi: "XÁO BÀI" },
    description: {
      en: "Randomly mix the deck.",
      vi: "Xáo trộn ngẫu nhiên xấp bài.",
    },
    icon: ShuffleIcon,
    bgColor: "bg-purple-600",
    borderColor: "border-purple-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.SEE_THE_FUTURE]: {
    name: { en: "SEE FUTURE", vi: "XEM TRƯỚC" },
    description: {
      en: "Peek at the top 3 cards of the deck.",
      vi: "Xem 3 lá bài trên cùng của xấp bài.",
    },
    icon: Eye,
    bgColor: "bg-cyan-600",
    borderColor: "border-cyan-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.NOPE]: {
    name: { en: "NOPE", vi: "CHẶN!" },
    description: {
      en: "Stop other player's action.",
      vi: "Chặn hành động của người chơi khác.",
    },
    icon: Ban,
    bgColor: "bg-slate-700",
    borderColor: "border-slate-500",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.CAT_1]: {
    name: { en: "BLUE CAT", vi: "MÈO XANH" },
    description: {
      en: "Collect pairs for special actions.",
      vi: "Thu thập để dùng combo.",
    },
    icon: Cat,
    bgColor: "bg-slate-800",
    borderColor: "border-slate-600",
    iconColor: "text-blue-400",
    textColor: "text-slate-300",
    isCombo: true,
  },
  [EKCardType.CAT_2]: {
    name: { en: "RED CAT", vi: "MÈO ĐỎ" },
    description: {
      en: "Collect pairs for special actions.",
      vi: "Thu thập để dùng combo.",
    },
    icon: Cat,
    bgColor: "bg-slate-800",
    borderColor: "border-slate-600",
    iconColor: "text-red-400",
    textColor: "text-slate-300",
    isCombo: true,
  },
  [EKCardType.CAT_3]: {
    name: { en: "PURPLE CAT", vi: "MÈO TÍM" },
    description: {
      en: "Collect pairs for special actions.",
      vi: "Thu thập để dùng combo.",
    },
    icon: Cat,
    bgColor: "bg-slate-800",
    borderColor: "border-slate-600",
    iconColor: "text-purple-400",
    textColor: "text-slate-300",
    isCombo: true,
  },
  [EKCardType.CAT_4]: {
    name: { en: "YELLOW CAT", vi: "MÈO VÀNG" },
    description: {
      en: "Collect pairs for special actions.",
      vi: "Thu thập để dùng combo.",
    },
    icon: Cat,
    bgColor: "bg-slate-800",
    borderColor: "border-slate-600",
    iconColor: "text-yellow-400",
    textColor: "text-slate-300",
    isCombo: true,
  },
  [EKCardType.CAT_5]: {
    name: { en: "GREEN CAT", vi: "MÈO LÁ" },
    description: {
      en: "Collect pairs for special actions.",
      vi: "Thu thập để dùng combo.",
    },
    icon: Cat,
    bgColor: "bg-slate-800",
    borderColor: "border-slate-600",
    iconColor: "text-green-400",
    textColor: "text-slate-300",
    isCombo: true,
  },
  // Expansion cards
  [EKCardType.REVERSE]: {
    name: { en: "REVERSE", vi: "ĐẢO CHIỀU" },
    description: {
      en: "Reverse direction, end turn without drawing.",
      vi: "Đảo chiều vòng chơi, kết thúc lượt mà không rút bài.",
    },
    icon: RotateCcw,
    bgColor: "bg-yellow-600",
    borderColor: "border-yellow-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.TARGETED_ATTACK]: {
    name: { en: "TARGETED ATTACK", vi: "TẤN CÔNG ĐÍCH DANH" },
    description: {
      en: "Choose a player to take 2 turns.",
      vi: "Chọn người phải đi 2 lượt.",
    },
    icon: Crosshair,
    bgColor: "bg-orange-600",
    borderColor: "border-orange-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.ALTER_THE_FUTURE_3]: {
    name: { en: "ALTER FUTURE 3X", vi: "SỬA TƯƠNG LAI 3X" },
    description: {
      en: "View and reorder top 3 cards.",
      vi: "Xem và sắp xếp lại 3 lá trên cùng.",
    },
    icon: Sparkle,
    bgColor: "bg-indigo-600",
    borderColor: "border-indigo-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.ALTER_THE_FUTURE_5]: {
    name: { en: "ALTER FUTURE 5X", vi: "SỬA TƯƠNG LAI 5X" },
    description: {
      en: "View and reorder top 5 cards.",
      vi: "Xem và sắp xếp lại 5 lá trên cùng.",
    },
    icon: Sparkles,
    bgColor: "bg-violet-600",
    borderColor: "border-violet-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.PERSONAL_ATTACK]: {
    name: { en: "PERSONAL ATTACK", vi: "TẤN CÔNG CÁ NHÂN" },
    description: {
      en: "You take 3 turns immediately.",
      vi: "Bạn phải thực hiện ngay 3 lượt.",
    },
    icon: Swords,
    bgColor: "bg-orange-600",
    borderColor: "border-orange-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.CATOMIC_BOMB]: {
    name: { en: "CATOMIC BOMB", vi: "BOM NGUYÊN TỬ" },
    description: {
      en: "All exploding kittens go to top. Turn ends.",
      vi: "Tất cả mèo nổ lên đầu chồng bài. Kết thúc lượt.",
    },
    icon: Atom,
    bgColor: "bg-slate-700",
    borderColor: "border-slate-600",
    iconColor: "text-red-500",
    textColor: "text-white",
  },
  [EKCardType.DRAW_BOTTOM]: {
    name: { en: "DRAW BOTTOM", vi: "RÚT ĐÁY" },
    description: {
      en: "Draw from bottom. Turn ends.",
      vi: "Rút bài từ đáy. Kết thúc lượt.",
    },
    icon: ArrowDown,
    bgColor: "bg-teal-600",
    borderColor: "border-teal-400",
    iconColor: "text-white",
    textColor: "text-white",
  },
  [EKCardType.BURY]: {
    name: { en: "BURY", vi: "CHÔN CẤT" },
    description: {
      en: "Draw top card secretly and bury it. Turn ends.",
      vi: "Rút lá đầu và chôn vào chồng bài. Kết thúc lượt.",
    },
    icon: Shovel,
    bgColor: "bg-amber-700",
    borderColor: "border-amber-500",
    iconColor: "text-white",
    textColor: "text-white",
  },
};

interface EKComboConfig {
  name: { en: string; vi: string };
  description: { en: string; vi: string };
}

export const COMBO_CONFIG: Record<number, EKComboConfig> = {
  2: {
    name: { en: "PAIR", vi: "CẶP" },
    description: {
      en: "Steal a random card from another player.",
      vi: "Cướp 1 lá bài ngẫu nhiên của người khác.",
    },
  },
  3: {
    name: { en: "THREE OF A KIND", vi: "BỘ 3" },
    description: {
      en: "Name a card and steal it from another player.",
      vi: "Chọn 1 loại bài và cướp 1 lá từ người chơi khác.",
    },
  },
  5: {
    name: { en: "FIVE DIFFERENT CARDS", vi: "BỘ 5 KHÁC LOẠI" },
    description: {
      en: "Take any card from the discard pile.",
      vi: "Lấy bất kỳ lá bài nào từ đống bài đã đánh.",
    },
  },
};
