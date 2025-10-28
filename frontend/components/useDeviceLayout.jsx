import { useState, useEffect } from "react";

export function useDeviceLayout() {
  const [device, setDevice] = useState("desktop");

  useEffect(() => {
    function handleResize() {
      const width = window.innerWidth;
      if (width < 1024) {
        setDevice("mobile");
      } else {
        setDevice("desktop");
      }
    }

    handleResize(); // initial check
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return device;
}
