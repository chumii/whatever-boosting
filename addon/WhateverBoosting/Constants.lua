WB = WB or {}

-- WoW class token → webapp class name (must match wow_classes.name in Supabase exactly)
WB.CLASS_NAMES = {
    WARRIOR     = "Warrior",
    PALADIN     = "Paladin",
    HUNTER      = "Hunter",
    ROGUE       = "Rogue",
    PRIEST      = "Priest",
    DEATHKNIGHT = "Death Knight",
    SHAMAN      = "Shaman",
    MAGE        = "Mage",
    WARLOCK     = "Warlock",
    MONK        = "Monk",
    DRUID       = "Druid",
    DEMONHUNTER = "Demon Hunter",
    EVOKER      = "Evoker",
}

-- WoW spec role token → webapp role name
WB.ROLE_NAMES = {
    TANK    = "Tank",
    HEALER  = "Heal",
    DAMAGER = "Dps",
}

-- Off-role choices cycled through in the UI (empty string = none)
WB.OFF_ROLE_OPTIONS = { "", "Tank", "Heal", "Dps" }
