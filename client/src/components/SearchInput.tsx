import { Search, X } from "lucide-react";
import { memo } from "react";
import useLanguage from "../stores/languageStore";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: { en: string; vi: string };
  className?: string;
}

const SearchInput = memo(
  ({ value, onChange, placeholder, className = "" }: SearchInputProps) => {
    const { ts } = useLanguage();

    const defaultPlaceholder = {
      en: "Search games...",
      vi: "Tìm kiếm trò chơi...",
    };

    return (
      <div className={`relative group ${className}`}>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={ts(placeholder || defaultPlaceholder)}
          className="w-full pl-10 pr-10 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full text-text-muted hover:text-text-primary transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  },
);

export default SearchInput;
