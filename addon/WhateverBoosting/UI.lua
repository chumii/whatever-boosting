WB = WB or {}

local FRAME_W = 860
local ROW_H   = 26

-- All collected fields as columns
-- x = left offset inside scroll content, w = width
local COLS = {
    track   = { x = 0,   w = 44,  hdr = "Track"   },
    name    = { x = 48,  w = 120, hdr = "Name"    },
    class   = { x = 172, w = 90,  hdr = "Class"   },
    main    = { x = 266, w = 46,  hdr = "Main"    },
    off     = { x = 316, w = 70,  hdr = "Off Role" },
    ilvl    = { x = 390, w = 50,  hdr = "iLvl"    },
    rating  = { x = 444, w = 52,  hdr = "Rating"  },
    dungeon = { x = 500, w = 190, hdr = "Dungeon"  },
    keylvl  = { x = 694, w = 36,  hdr = "+Lvl"    },
    upd     = { x = 734, w = 60,  hdr = "Updated"  },
    trade   = { x = 798, w = 48,  hdr = "Trade"    },
}

local mainFrame   = nil
local exportFrame = nil
local rowPool     = {}

local function relativeTime(t)
    if not t then return "" end
    local diff = time() - t
    if diff < 60      then return "just now"
    elseif diff < 3600   then return math.floor(diff / 60)   .. "m ago"
    elseif diff < 86400  then return math.floor(diff / 3600)  .. "h ago"
    else return math.floor(diff / 86400) .. "d ago"
    end
end

local function cycleOffRole(current)
    local opts = WB.OFF_ROLE_OPTIONS
    for i, v in ipairs(opts) do
        if v == (current or "") then return opts[(i % #opts) + 1] end
    end
    return ""
end

local function offRoleLabel(v)
    return (v and v ~= "") and v or "—"
end

local function numLabel(v)
    return (v ~= nil) and tostring(v) or "—"
end

-- ---------- Row factory ----------
local function makeRow(parent, idx)
    local row = CreateFrame("Frame", nil, parent)
    row:SetSize(FRAME_W - 28, ROW_H)

    local bg = row:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    if idx % 2 == 0 then bg:SetColorTexture(0.05, 0.05, 0.05, 0.6) end

    local function lbl(col, font, r, g, b)
        local f = row:CreateFontString(nil, "OVERLAY", font or "GameFontNormalSmall")
        f:SetPoint("LEFT", row, "LEFT", col.x + 2, 0)
        f:SetWidth(col.w - 2)
        f:SetJustifyH("LEFT")
        if r then f:SetTextColor(r, g, b) end
        return f
    end

    row.nameLabel    = lbl(COLS.name,    "GameFontNormal")
    row.classLabel   = lbl(COLS.class,   nil, 0.6, 0.6, 0.6)
    row.mainRoleBtn = CreateFrame("Button", nil, row, "UIPanelButtonTemplate")
    row.mainRoleBtn:SetSize(COLS.main.w - 2, ROW_H - 4)
    row.mainRoleBtn:SetPoint("LEFT", row, "LEFT", COLS.main.x, 0)
    row.ilvlLabel    = lbl(COLS.ilvl,    nil, 0.9, 0.9, 0.7)
    row.ratingLabel  = lbl(COLS.rating,  nil, 0.7, 0.9, 0.7)
    row.dungeonLabel = lbl(COLS.dungeon, nil, 0.8, 0.8, 1.0)
    row.keylvlLabel  = lbl(COLS.keylvl, nil, 0.8, 0.8, 1.0)
    row.updLabel     = lbl(COLS.upd,     nil, 0.35, 0.35, 0.35)
    row.tradeLabel   = lbl(COLS.trade,   nil, 0.5,  0.5,  0.5)

    row.trackedCheck = CreateFrame("CheckButton", nil, row, "UICheckButtonTemplate")
    row.trackedCheck:SetSize(20, 20)
    row.trackedCheck:SetPoint("LEFT", row, "LEFT", COLS.track.x + 12, 0)

    row.offRoleBtn = CreateFrame("Button", nil, row, "UIPanelButtonTemplate")
    row.offRoleBtn:SetSize(COLS.off.w - 2, ROW_H - 4)
    row.offRoleBtn:SetPoint("LEFT", row, "LEFT", COLS.off.x, 0)

    return row
end

-- ---------- Row population ----------
function WB.RebuildRows()
    local db = WhateverBoostingDB
    if not mainFrame or not db or not db.characters then return end

    local content = mainFrame.scrollContent
    for _, row in ipairs(rowPool) do row:Hide() end

    local chars = {}
    for key, data in pairs(db.characters) do chars[#chars+1] = { key = key, data = data } end
    table.sort(chars, function(a, b) return (a.data.name or "") < (b.data.name or "") end)

    content:SetHeight(math.max(#chars * ROW_H, 10))

    for idx, entry in ipairs(chars) do
        local row = rowPool[idx]
        if not row then
            row = makeRow(content, idx)
            rowPool[idx] = row
        end

        local key  = entry.key
        local data = entry.data

        row:ClearAllPoints()
        row:SetPoint("TOPLEFT", content, "TOPLEFT", 0, -(idx - 1) * ROW_H)
        row:Show()

        row.nameLabel:SetText(data.name or "?")
        row.classLabel:SetText(data.class or "—")
        row.mainRoleBtn:SetText(data.main_role or "?")
        row.mainRoleBtn._key = key
        row.mainRoleBtn:SetScript("OnClick", function(self)
            local char = WhateverBoostingDB.characters[self._key]
            local opts = { "Tank", "Heal", "Dps" }
            local next = opts[1]
            for i, v in ipairs(opts) do
                if v == char.main_role then next = opts[(i % #opts) + 1]; break end
            end
            char.main_role          = next
            char.main_role_override = true
            self:SetText(next)
        end)
        row.ilvlLabel:SetText(numLabel(data.item_level))
        row.ratingLabel:SetText(numLabel(data.rating))
        row.dungeonLabel:SetText(data.current_key_dungeon or "—")
        row.keylvlLabel:SetText(numLabel(data.current_key_level))
        row.updLabel:SetText(relativeTime(data.last_updated))

        if data.can_trade_all == true then
            row.tradeLabel:SetText("Yes")
            row.tradeLabel:SetTextColor(0.2, 0.9, 0.2)
        elseif data.can_trade_all == false then
            row.tradeLabel:SetText("No")
            row.tradeLabel:SetTextColor(0.9, 0.3, 0.3)
        else
            row.tradeLabel:SetText("—")
            row.tradeLabel:SetTextColor(0.35, 0.35, 0.35)
        end

        row.trackedCheck:SetChecked(data.tracked ~= false)
        row.trackedCheck._key = key
        row.trackedCheck:SetScript("OnClick", function(self)
            WhateverBoostingDB.characters[self._key].tracked = self:GetChecked()
        end)

        row.offRoleBtn:SetText(offRoleLabel(data.off_role))
        row.offRoleBtn._key = key
        row.offRoleBtn:SetScript("OnClick", function(self)
            local cur  = WhateverBoostingDB.characters[self._key].off_role
            local next = cycleOffRole(cur)
            WhateverBoostingDB.characters[self._key].off_role = next
            self:SetText(offRoleLabel(next))
        end)
    end
end

function WB.RefreshUI()
    if mainFrame and mainFrame:IsShown() then WB.RebuildRows() end
end

-- ---------- Export dialog ----------
local function buildExportFrame()
    exportFrame = CreateFrame("Frame", "WBExportFrame", UIParent, "BasicFrameTemplate")
    exportFrame:SetSize(540, 120)
    exportFrame:SetPoint("CENTER")
    exportFrame:SetMovable(true)
    exportFrame:EnableMouse(true)
    exportFrame:RegisterForDrag("LeftButton")
    exportFrame:SetScript("OnDragStart", exportFrame.StartMoving)
    exportFrame:SetScript("OnDragStop", exportFrame.StopMovingOrSizing)
    exportFrame:SetClampedToScreen(true)
    exportFrame:SetFrameStrata("DIALOG")
    exportFrame:Hide()
    exportFrame.TitleText:SetText("Export — Whatever Boosting")

    local hint = exportFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    hint:SetText("Ctrl+A, Ctrl+C to copy:")
    hint:SetPoint("TOPLEFT", exportFrame, "TOPLEFT", 14, -32)
    hint:SetTextColor(0.6, 0.6, 0.6)

    local editBox = CreateFrame("EditBox", nil, exportFrame, "InputBoxTemplate")
    editBox:SetSize(508, 28)
    editBox:SetPoint("TOPLEFT", exportFrame, "TOPLEFT", 14, -52)
    editBox:SetMaxLetters(65535)
    editBox:SetScript("OnEscapePressed", function() exportFrame:Hide() end)
    editBox:SetScript("OnKeyDown", function(self, key)
        if IsControlKeyDown() and key == "A" then self:HighlightText() end
    end)

    exportFrame.editBox = editBox
end

function WB.ShowExportDialog()
    local str, err = WB.BuildExportString()
    if not str then
        DEFAULT_CHAT_FRAME:AddMessage("|cffff4444[WhateverBoosting]|r " .. (err or "Export failed"))
        return
    end
    if not exportFrame then buildExportFrame() end
    exportFrame.editBox:SetText(str)
    exportFrame.editBox:HighlightText()
    exportFrame:Show()
    exportFrame.editBox:SetFocus()
end

-- ---------- Main frame ----------
local function buildMainFrame()
    mainFrame = CreateFrame("Frame", "WBMainFrame", UIParent, "BasicFrameTemplate")
    mainFrame:SetSize(FRAME_W, 460)
    mainFrame:SetPoint("CENTER")
    mainFrame:SetMovable(true)
    mainFrame:EnableMouse(true)
    mainFrame:RegisterForDrag("LeftButton")
    mainFrame:SetScript("OnDragStart", mainFrame.StartMoving)
    mainFrame:SetScript("OnDragStop", mainFrame.StopMovingOrSizing)
    mainFrame:SetClampedToScreen(true)
    mainFrame:SetFrameStrata("MEDIUM")
    mainFrame:Hide()
    local version = GetAddOnMetadata("WhateverBoosting", "Version") or "?"
    mainFrame.TitleText:SetText("Whatever Boosting  v" .. version)

    local refreshBtn = CreateFrame("Button", nil, mainFrame, "UIPanelButtonTemplate")
    refreshBtn:SetSize(80, 22)
    refreshBtn:SetPoint("TOPLEFT", mainFrame, "TOPLEFT", 10, -28)
    refreshBtn:SetText("Refresh")
    refreshBtn:SetScript("OnClick", function() WB.CollectCurrentChar() end)

    local exportBtn = CreateFrame("Button", nil, mainFrame, "UIPanelButtonTemplate")
    exportBtn:SetSize(80, 22)
    exportBtn:SetPoint("TOPRIGHT", mainFrame, "TOPRIGHT", -28, -28)
    exportBtn:SetText("Export")
    exportBtn:SetScript("OnClick", function() WB.ShowExportDialog() end)

    local ktCheck = CreateFrame("CheckButton", nil, mainFrame, "UICheckButtonTemplate")
    ktCheck:SetSize(20, 20)
    ktCheck:SetPoint("LEFT", refreshBtn, "RIGHT", 12, 0)
    ktCheck:SetScript("OnClick", function()
        if WB.KeystoneTrader then WB.KeystoneTrader.Toggle() end
    end)
    local ktLabel = mainFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    ktLabel:SetPoint("LEFT", ktCheck, "RIGHT", 2, 0)
    ktLabel:SetText("Keystone Trader")
    ktLabel:SetTextColor(0.45, 0.45, 0.45)
    mainFrame.ktCheck = ktCheck

    -- Trade check item level input
    local tradeLevelBox = CreateFrame("EditBox", "WBTradeLevelBox", mainFrame, "InputBoxTemplate")
    tradeLevelBox:SetSize(46, 22)
    tradeLevelBox:SetPoint("RIGHT", exportBtn, "LEFT", -6, 0)
    tradeLevelBox:SetNumeric(true)
    tradeLevelBox:SetMaxLetters(4)
    tradeLevelBox:SetAutoFocus(false)
    tradeLevelBox:SetText(tostring((WhateverBoostingDB and WhateverBoostingDB.tradeCheckLevel) or 266))

    local tradeLevelLabel = mainFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    tradeLevelLabel:SetPoint("RIGHT", tradeLevelBox, "LEFT", -4, 0)
    tradeLevelLabel:SetText("iLvl")
    tradeLevelLabel:SetTextColor(0.45, 0.45, 0.45)

    local function applyTradeLevel()
        local val = tradeLevelBox:GetNumber()
        if val and val > 0 then
            if WB.TradeCheck then WB.TradeCheck.TRADE_LEVEL = val end
            if WhateverBoostingDB then WhateverBoostingDB.tradeCheckLevel = val end
        end
    end
    tradeLevelBox:SetScript("OnEnterPressed", function(self) applyTradeLevel() self:ClearFocus() end)
    tradeLevelBox:SetScript("OnEditFocusLost", applyTradeLevel)
    tradeLevelBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)

    -- Column headers
    local function hdr(col)
        local f = mainFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
        f:SetPoint("TOPLEFT", mainFrame, "TOPLEFT", col.x + 10, -56)
        f:SetWidth(col.w)
        f:SetText(col.hdr)
        f:SetJustifyH("LEFT")
        f:SetTextColor(0.5, 0.5, 0.5)
    end
    for _, col in pairs(COLS) do hdr(col) end

    local scrollFrame = CreateFrame("ScrollFrame", nil, mainFrame, "UIPanelScrollFrameTemplate")
    scrollFrame:SetPoint("TOPLEFT",     mainFrame, "TOPLEFT",      8, -72)
    scrollFrame:SetPoint("BOTTOMRIGHT", mainFrame, "BOTTOMRIGHT", -26,   8)

    local content = CreateFrame("Frame", nil, scrollFrame)
    content:SetWidth(FRAME_W - 28)
    content:SetHeight(10)
    scrollFrame:SetScrollChild(content)

    mainFrame.scrollContent = content
    tinsert(UISpecialFrames, "WBMainFrame")
end

function WB.ToggleUI()
    if not mainFrame then buildMainFrame() end
    if mainFrame:IsShown() then
        mainFrame:Hide()
    else
        if mainFrame.ktCheck and WB.KeystoneTrader then
            mainFrame.ktCheck:SetChecked(WB.KeystoneTrader.IsEnabled())
        end
        WB.RebuildRows()
        mainFrame:Show()
    end
end
