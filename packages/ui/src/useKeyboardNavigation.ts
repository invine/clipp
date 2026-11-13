import { useEffect, useState } from "react";

export function useKeyboardNavigation(): boolean {
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) {
        setKeyboardNavigation(true);
      }
    }
    function handlePointerDown() {
      setKeyboardNavigation(false);
    }
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  return keyboardNavigation;
}
