WB = WB or {}

local function initDB()
    if not WhateverBoostingDB then WhateverBoostingDB = {} end
    if not WhateverBoostingDB.characters then WhateverBoostingDB.characters = {} end
end

local function getSpecRole()
    local specIndex = GetSpecialization()
    if not specIndex then return nil end
    local _, _, _, _, role = GetSpecializationInfo(specIndex)
    return WB.ROLE_NAMES[role]
end

local function doCollect()
    local name = UnitName("player")
    if not name then return end

    local realm = GetNormalizedRealmName() or GetRealmName() or "Unknown"
    local key   = realm .. "-" .. name

    local _, classToken = UnitClass("player")
    local className = WB.CLASS_NAMES[classToken] or classToken

    local mainRole = getSpecRole()

    local _, equippedIlvl = GetAverageItemLevel()
    if equippedIlvl then
        equippedIlvl = math.floor(equippedIlvl + 0.5)
    end

    local ratingData = C_PlayerInfo.GetPlayerMythicPlusRatingSummary("player")
    local rating = (ratingData and ratingData.currentSeasonScore) or 0

    local mapId    = C_MythicPlus.GetOwnedKeystoneChallengeMapID()
    local keyLevel = C_MythicPlus.GetOwnedKeystoneLevel()
    local dungeonName
    if mapId then
        dungeonName = WB.DUNGEONS[mapId]
        if not dungeonName then
            -- Fallback: localized name from the game (may not match webapp on non-enUS clients)
            local n = C_ChallengeMode.GetMapUIInfo(mapId)
            dungeonName = n
        end
    end

    local existing = WhateverBoostingDB.characters[key] or {}

    -- Only overwrite key data if we actually got something this pass.
    -- This prevents a blank retry from erasing a previously stored key.
    local keyDungeon = dungeonName or existing.current_key_dungeon
    local keyMapId   = mapId       or existing.current_key_map_id
    local keyLvl     = keyLevel    or existing.current_key_level

    WhateverBoostingDB.characters[key] = {
        name                = name,
        realm               = realm,
        class               = className,
        main_role           = mainRole,
        off_role            = existing.off_role,
        current_key_dungeon = keyDungeon,
        current_key_map_id  = keyMapId,
        current_key_level   = keyLvl,
        rating              = rating,
        item_level          = equippedIlvl,
        tracked             = (existing.tracked == nil) and true or existing.tracked,
        last_updated        = time(),
    }

    if WB.RefreshUI then WB.RefreshUI() end
    return mapId ~= nil  -- true = key data was fresh this pass
end

-- Retry collecting key data until the M+ system has synced with the server.
-- Tries immediately, then at 3 s, 7 s, 15 s, 30 s after login.
local RETRY_DELAYS = { 0, 3, 7, 15, 30 }
local function collectWithRetry(attempt)
    local gotKey = doCollect()
    if gotKey then return end  -- key data is ready, stop retrying
    local delay = RETRY_DELAYS[attempt + 1]
    if not delay then return end  -- exhausted all retries
    C_Timer.After(delay, function() collectWithRetry(attempt + 1) end)
end

local collectTimer = nil
local function scheduleCollect()
    if collectTimer then collectTimer:Cancel() end
    collectTimer = C_Timer.After(1.5, function()
        collectTimer = nil
        doCollect()
    end)
end

local eventFrame = CreateFrame("Frame", "WhateverBoostingEventFrame")
eventFrame:RegisterEvent("PLAYER_LOGIN")
eventFrame:RegisterEvent("PLAYER_ENTERING_WORLD")
eventFrame:RegisterEvent("PLAYER_SPECIALIZATION_CHANGED")
eventFrame:RegisterEvent("BAG_UPDATE_DELAYED")
eventFrame:RegisterEvent("CHALLENGE_MODE_MAPS_UPDATE")

eventFrame:SetScript("OnEvent", function(self, event)
    initDB()
    if event == "PLAYER_LOGIN" or event == "PLAYER_ENTERING_WORLD" then
        -- Start the retry loop: 0 s, 3 s, 7 s, 15 s, 30 s
        collectWithRetry(0)
    elseif event == "PLAYER_SPECIALIZATION_CHANGED" then
        doCollect()
    elseif event == "CHALLENGE_MODE_MAPS_UPDATE" then
        -- This event IS the "M+ data is ready" signal — collect immediately, no debounce
        doCollect()
    elseif event == "BAG_UPDATE_DELAYED" then
        scheduleCollect()
    end
end)

SLASH_WB1 = "/wb"
SLASH_WB2 = "/whatevboosting"
SlashCmdList["WB"] = function()
    initDB()
    WB.ToggleUI()
end

WB.CollectCurrentChar = doCollect
