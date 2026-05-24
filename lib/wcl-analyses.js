// Each analysis defines what WCL events to fetch and how to label abilities.
// Add new analyses here; the API route and frontend pick them up automatically.

export const ANALYSES = {
  DEFENSIVE_CDS: {
    label: "Defensive CDs",
    dataType: "Casts",
    filterExpression:
      "ability.id IN (51052, 48743, 48792, 48707, 49998, 196718, 198589, 2061, 1261867, 22812, 22842, 5487, 61336, 374227, 363916, 360827, 186265, 53480, 109304, 264735, 45438, 414658, 342245, 235450, 235313, 235219, 11426, 115203, 122470, 633, 1022, 642, 403876, 498, 19236, 586, 47585, 31224, 5277, 185311, 1966, 198103, 108271, 104773, 108416, 452930, 6789, 202168, 23920, 386208, 118038, 1277297, 184264, 6262, 1234768) AND source.role != 'tank'",

    // ability ID → display name
    abilities: {
      // Death Knight
      51052: "Anti-Magic Zone",
      48743: "Death Pact",
      48792: "Icebound Fortitude",
      48707: "Anti-Magic Shell",
      49998: "Death Strike",
      // Demon Hunter
      196718: "Darkness",
      198589: "Blur",
      202168: "Blur",
      // Druid
      22812:   "Barkskin",
      22842:   "Frenzied Regeneration",
      5487:    "Bear Form",
      61336:   "Survival Instincts",
      // Evoker
      374227: "Rewind",
      363916: "Verdant Embrace",
      360827: "Obsidian Scales",
      1261867: "Oppressing Roar",
      1234768: "Rescue",
      // Hunter
      186265: "Aspect of the Turtle",
      53480:  "Roar of Sacrifice",
      109304: "Exhilaration",
      264735: "Survival of the Fittest",
      // Mage
      45438:  "Ice Block",
      414658: "Ice Cold",
      342245: "Alter Time",
      235450: "Prismatic Barrier",
      235313: "Ice Barrier",
      235219: "Shimmer",
      11426:  "Ice Barrier",
      118038: "Blazing Barrier",
      // Monk
      115203: "Fortifying Brew",
      122470: "Touch of Karma",
      // Paladin
      633:    "Lay on Hands",
      1022:   "Blessing of Protection",
      642:    "Divine Shield",
      403876: "Divine Protection",
      498:    "Divine Protection",
      19236:  "Ardent Defender",
      // Priest
      586:   "Fade",
      47585: "Dispersion",
      2061:  "Flash Heal",
      // Rogue
      31224:  "Cloak of Shadows",
      5277:   "Evasion",
      185311: "Crimson Vial",
      1966:   "Feint",
      198103: "Riposte",
      // Shaman
      108271: "Astral Shift",
      // Warlock
      104773: "Unending Resolve",
      108416: "Dark Pact",
      452930: "Soul Link",
      6789:   "Death Coil",
      // Warrior
      23920:  "Spell Reflection",
      386208: "Rallying Cry",
      184264: "Enraged Regeneration",
      1277297: "Bounding Leap",
      // General
      6262: "Healthstone",
    },
  },
};
