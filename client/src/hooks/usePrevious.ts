import { useEffect, useRef } from "react";

export default function usePrevious<T>(
  value: T,
  onChange?: (prev: T, current: T) => void,
) {
  const prevRef = useRef<T>(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (onChangeRef.current && prevRef.current !== value) {
      onChangeRef.current(prevRef.current, value);
    }
    console.log("usePrev", prevRef.current, value);

    prevRef.current = value;
  }, [value]);

  return prevRef.current;
}
