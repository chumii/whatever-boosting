-- TradeCheck.lua
-- Checks whether a character can trade all gear slots at a given item level.
-- /tc <itemlevel>   — local check (also /wb tc <itemlevel>)
-- !tc <itemlevel>   — party chat trigger; responds to party with the result

WB = WB or {}

-- Slot IDs and display names used by C_ItemUpgrade.GetHighWatermarkForSlot
local ARMOR_SLOTS = {
    { id = 0,  name = "Head"      },
    { id = 1,  name = "Neck"      },
    { id = 2,  name = "Shoulders" },
    { id = 3,  name = "Chest"     },
    { id = 4,  name = "Waist"     },
    { id = 5,  name = "Legs"      },
    { id = 6,  name = "Boots"     },
    { id = 7,  name = "Wrists"    },
    { id = 8,  name = "Hands"     },
    { id = 9,  name = "Rings"     },
    { id = 10, name = "Trinkets"  },
    { id = 11, name = "Back"      },
}

local function getNoTradeSlots(minLevel)
    local noTrade = {}

    for _, slot in ipairs(ARMOR_SLOTS) do
        local high = C_ItemUpgrade.GetHighWatermarkForSlot(slot.id) or 0
        if high < minLevel then
            noTrade[#noTrade + 1] = slot.name
        end
    end

    -- Weapons: max of (mainhand, min(mainhand+offhand), min(1h+1h))
    local mainhand  = C_ItemUpgrade.GetHighWatermarkForSlot(13) or 0
    local offhand   = C_ItemUpgrade.GetHighWatermarkForSlot(16) or 0
    local onehand   = C_ItemUpgrade.GetHighWatermarkForSlot(14) or 0
    local onehands2 = C_ItemUpgrade.GetHighWatermarkForSlot(15) or 0
    local weaponMark = math.max(
        mainhand,
        math.min(mainhand, offhand),
        math.min(onehand, onehands2)
    )
    if weaponMark < minLevel then
        noTrade[#noTrade + 1] = "Weapons"
    end

    return noTrade
end

local PREFIX = "|cff00ccff[TC]|r"

local function check(minLevel)
    local noTrade = getNoTradeSlots(minLevel)
    if #noTrade == 0 then
        return "Trade all"
    end
    return table.concat(noTrade, " ")
end

local function printResult(minLevel, result)
    DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. " " .. minLevel .. " — " .. result)
end

local function handleCommand(msg)
    local itemLevel = tonumber(msg and msg:match("%d+"))
    if not itemLevel then
        DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. " Usage: /tc <itemlevel>")
        return
    end
    printResult(itemLevel, check(itemLevel))
end

-- ── Slash command /tc ────────────────────────────────────────────────────

SLASH_WBTRADECHECK1 = "/tc"
SlashCmdList["WBTRADECHECK"] = handleCommand

-- ── Party chat !tc trigger ────────────────────────────────────────────────

local ev = CreateFrame("Frame")
ev:RegisterEvent("CHAT_MSG_PARTY")
ev:RegisterEvent("CHAT_MSG_PARTY_LEADER")
ev:SetScript("OnEvent", function(_, _, message, author)
    local lvStr = message:match("^!tc%s+(%d+)$")
    if not lvStr then return end
    if author == UnitName("player") then return end
    local itemLevel = tonumber(lvStr)
    if not itemLevel then return end
    SendChatMessage("TC " .. itemLevel .. ": " .. check(itemLevel), "PARTY")
end)

-- ── Module API ────────────────────────────────────────────────────────────

WB.TradeCheck = {
    Check        = handleCommand,
    CanTradeAll  = function(minLevel) return #getNoTradeSlots(minLevel) == 0 end,
    TRADE_LEVEL  = 266,
}
