export function normalizeToBaseSymbol(symbol) {
  if (symbol.includes("LONG")) {
    return symbol.replace("LONG/USD", "/USD");
  } 
  if (symbol.includes("SHORT")) {
    return symbol.replace("SHORT/USD", "/USD");
  }
  return symbol;
}

export function normalizeToMarketSymbol(symbol) {
  // This one keeps it /USD style (if needed for Coinbase fetcher)
  if (symbol.includes("LONG")) {
    return symbol.replace("LONG/USD", "/USD");
  }
  if (symbol.includes("SHORT")) {
    return symbol.replace("SHORT/USD", "/USD");
  }
  return symbol;
}
