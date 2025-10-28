// entryFeeTokens.js
const entryFeeTokens = {
  avax: {
    tokens: {
      "0x0000000000000000000000000000000000000000": {
        name: "AVAX",
        icon: "/icons/avax.svg",
        tiers: {
          A: "25",
          B: "10",
          C: "5",
          D: "1",
          E: "0.5",
          F: "0.1",
        },
      },
    },
    duration: ["6 hours", "12 hours", "24 hours", "1 week"],
    icon: "/icons/avax.svg",
  },
};

export default entryFeeTokens;
