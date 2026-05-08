-- Setup.lua
-- Debug/setup panel for capturing KeystoneTrader constants.
-- Open with: /wb setup
-- Captured values are saved to SavedVariables and shown in a copyable box.

WB = WB or {}

local setupFrame = nil
local msgFrame   = nil   -- ScrollingMessageFrame for status log
local outBox     = nil   -- InputBoxTemplate for the copyable JSON output

local captured = {
    npc_id          = nil,
    npc_name        = nil,
    zone_map_id     = nil,
    gossip_options  = nil,   -- array of {id=N, name="..."}
    gossip_done_text = nil,
}

-- ── Helpers ───────────────────────────────────────────────────────────────

local function log(text, r, g, b)
    if msgFrame then
        msgFrame:AddMessage(text, r or 1, g or 1, b or 1)
    end
end

local function saveCaptures()
    if not WhateverBoostingDB then return end
    WhateverBoostingDB.ktSetup = {
        npc_id           = captured.npc_id,
        npc_name         = captured.npc_name,
        zone_map_id      = captured.zone_map_id,
        gossip_options   = captured.gossip_options,
        gossip_done_text = captured.gossip_done_text,
    }
end

local function loadCaptures()
    local s = WhateverBoostingDB and WhateverBoostingDB.ktSetup
    if not s then return end
    captured.npc_id          = s.npc_id
    captured.npc_name        = s.npc_name
    captured.zone_map_id     = s.zone_map_id
    captured.gossip_options  = s.gossip_options
    captured.gossip_done_text = s.gossip_done_text
end

local function refreshOutput()
    if not outBox then return end
    outBox:SetText(WB_JSONEncode(captured))
    outBox:HighlightText()
end

-- ── Capture functions ─────────────────────────────────────────────────────

local function captureNPC()
    local guid = UnitGUID("target")
    if not guid then
        log("  ERROR: No target. Target the custodian NPC first.", 1, 0.3, 0.3)
        return
    end
    local npcID = tonumber((select(6, strsplit("-", guid))))
    local name  = UnitName("target") or "?"
    captured.npc_id   = npcID
    captured.npc_name = name
    log(string.format("  NPC captured:  id=%d  name=%s", npcID, name), 0.3, 1, 0.3)
    saveCaptures()
    refreshOutput()
end

local function captureZone()
    local mapID = C_Map.GetBestMapForUnit("player")
    if not mapID then
        log("  ERROR: Could not determine current map ID.", 1, 0.3, 0.3)
        return
    end
    captured.zone_map_id = mapID
    log(string.format("  Zone captured: map_id=%d", mapID), 0.3, 1, 0.3)
    saveCaptures()
    refreshOutput()
end

local function captureGossipOptions()
    local opts = C_GossipInfo.GetOptions()
    if not opts or #opts == 0 then
        log("  ERROR: No gossip open. Open gossip with the custodian first.", 1, 0.3, 0.3)
        return
    end
    local simplified = {}
    for _, opt in ipairs(opts) do
        simplified[#simplified + 1] = { id = opt.gossipOptionID or 0, name = opt.name or "" }
    end
    captured.gossip_options = simplified
    log(string.format("  Gossip options captured: %d options", #simplified), 0.3, 1, 0.3)
    for i, opt in ipairs(simplified) do
        log(string.format("    [%d] id=%d  \"%s\"", i, opt.id, opt.name), 0.8, 0.8, 0.8)
    end
    saveCaptures()
    refreshOutput()
end

local function captureGossipText()
    local text = C_GossipInfo.GetText()
    if not text or text == "" then
        log("  ERROR: No gossip text visible. Open gossip when NPC responds after a trade.", 1, 0.3, 0.3)
        return
    end
    captured.gossip_done_text = text
    log(string.format("  Gossip text captured: \"%s\"", text), 0.3, 1, 0.3)
    saveCaptures()
    refreshOutput()
end

-- ── UI construction ───────────────────────────────────────────────────────

local function buildSetupFrame()
    if setupFrame then return end

    local F_W, F_H = 540, 420
    setupFrame = CreateFrame("Frame", "WBSetupFrame", UIParent, "BasicFrameTemplate")
    setupFrame:SetSize(F_W, F_H)
    setupFrame:SetPoint("CENTER")
    setupFrame:SetMovable(true)
    setupFrame:EnableMouse(true)
    setupFrame:RegisterForDrag("LeftButton")
    setupFrame:SetScript("OnDragStart", setupFrame.StartMoving)
    setupFrame:SetScript("OnDragStop", setupFrame.StopMovingOrSizing)
    setupFrame:SetClampedToScreen(true)
    setupFrame:SetFrameStrata("DIALOG")
    setupFrame:Hide()
    setupFrame.TitleText:SetText("WB Setup — Keystone Trader Constants")

    -- Instructions
    local instr = setupFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    instr:SetPoint("TOPLEFT", setupFrame, "TOPLEFT", 12, -32)
    instr:SetWidth(F_W - 24)
    instr:SetJustifyH("LEFT")
    instr:SetTextColor(0.55, 0.55, 0.55)
    instr:SetText(
        "1. TARGET the custodian NPC → click [Capture NPC]\n" ..
        "2. STAND at custodian location (no gossip) → click [Capture Zone]\n" ..
        "3. OPEN GOSSIP with custodian → click [Capture Options]\n" ..
        "4. After key reaches target, NPC says something → click [Capture Text]"
    )

    -- Buttons
    local btnY = -100
    local btnDefs = {
        { label = "Capture NPC",     fn = captureNPC,            tip = "Target the custodian NPC first" },
        { label = "Capture Zone",    fn = captureZone,           tip = "Stand at the custodian's location" },
        { label = "Capture Options", fn = captureGossipOptions,  tip = "Open gossip with the custodian first" },
        { label = "Capture Text",    fn = captureGossipText,     tip = "Open gossip when custodian responds after a trade" },
    }
    local btnX = 12
    for _, def in ipairs(btnDefs) do
        local btn = CreateFrame("Button", nil, setupFrame, "UIPanelButtonTemplate")
        btn:SetSize(120, 24)
        btn:SetPoint("TOPLEFT", setupFrame, "TOPLEFT", btnX, btnY)
        btn:SetText(def.label)
        btn:SetScript("OnClick", def.fn)
        btn:SetScript("OnEnter", function()
            GameTooltip:SetOwner(btn, "ANCHOR_TOP")
            GameTooltip:AddLine(def.tip, 1, 1, 1, true)
            GameTooltip:Show()
        end)
        btn:SetScript("OnLeave", function() GameTooltip:Hide() end)
        btnX = btnX + 126
    end

    -- Status log (ScrollingMessageFrame)
    local logBg = CreateFrame("Frame", nil, setupFrame, "BackdropTemplate")
    logBg:SetPoint("TOPLEFT",     setupFrame, "TOPLEFT",      10, -130)
    logBg:SetPoint("BOTTOMRIGHT", setupFrame, "BOTTOMRIGHT", -10,  80)
    logBg:SetBackdrop({
        bgFile = "Interface\\Buttons\\WHITE8X8",
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        tile = false, edgeSize = 8,
        insets = { left = 2, right = 2, top = 2, bottom = 2 },
    })
    logBg:SetBackdropColor(0.04, 0.04, 0.04, 0.9)
    logBg:SetBackdropBorderColor(0.18, 0.18, 0.18, 1)

    msgFrame = CreateFrame("ScrollingMessageFrame", "WBSetupLog", logBg)
    msgFrame:SetPoint("TOPLEFT",     logBg, "TOPLEFT",      4, -4)
    msgFrame:SetPoint("BOTTOMRIGHT", logBg, "BOTTOMRIGHT", -4,  4)
    msgFrame:SetFontObject(GameFontNormalSmall)
    msgFrame:SetJustifyH("LEFT")
    msgFrame:SetMaxLines(200)
    msgFrame:SetFading(false)
    msgFrame:EnableMouseWheel(true)
    msgFrame:SetScript("OnMouseWheel", function(self, delta)
        if delta > 0 then self:ScrollUp() else self:ScrollDown() end
    end)

    -- Output box label
    local outLabel = setupFrame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    outLabel:SetPoint("BOTTOMLEFT", setupFrame, "BOTTOMLEFT", 12, 58)
    outLabel:SetText("Captured values (Ctrl+A  Ctrl+C  to copy, then paste here):")
    outLabel:SetTextColor(0.5, 0.5, 0.5)

    -- Copyable output EditBox
    outBox = CreateFrame("EditBox", "WBSetupOutBox", setupFrame, "InputBoxTemplate")
    outBox:SetPoint("BOTTOMLEFT",  setupFrame, "BOTTOMLEFT",  10, 32)
    outBox:SetPoint("BOTTOMRIGHT", setupFrame, "BOTTOMRIGHT", -10, 32)
    outBox:SetHeight(26)
    outBox:SetMaxLetters(65535)
    outBox:SetAutoFocus(false)
    outBox:SetScript("OnEscapePressed", function() setupFrame:Hide() end)
    outBox:SetScript("OnKeyDown", function(self, key)
        if IsControlKeyDown() and key == "A" then self:HighlightText() end
    end)
    outBox:SetScript("OnEditFocusGained", function(self) self:HighlightText() end)

    -- Clear log button
    local clearBtn = CreateFrame("Button", nil, setupFrame, "UIPanelButtonTemplate")
    clearBtn:SetSize(60, 20)
    clearBtn:SetPoint("BOTTOMRIGHT", logBg, "TOPRIGHT", 0, 2)
    clearBtn:SetText("Clear log")
    clearBtn:SetScript("OnClick", function() msgFrame:Clear() end)
end

-- ── Toggle ────────────────────────────────────────────────────────────────

function WB.ToggleSetup()
    buildSetupFrame()
    if setupFrame:IsShown() then
        setupFrame:Hide()
    else
        -- Restore previously saved captures
        loadCaptures()
        refreshOutput()
        -- Show a summary of what's already captured
        msgFrame:Clear()
        log("── Captured so far ──────────────────────────────", 0.4, 0.4, 0.4)
        if captured.npc_id then
            log(string.format("  NPC: id=%d  name=%s", captured.npc_id, captured.npc_name or "?"), 0.3, 1, 0.3)
        else
            log("  NPC: not yet captured", 0.7, 0.5, 0.3)
        end
        if captured.zone_map_id then
            log(string.format("  Zone: map_id=%d", captured.zone_map_id), 0.3, 1, 0.3)
        else
            log("  Zone: not yet captured", 0.7, 0.5, 0.3)
        end
        if captured.gossip_options then
            log(string.format("  Gossip options: %d options", #captured.gossip_options), 0.3, 1, 0.3)
        else
            log("  Gossip options: not yet captured", 0.7, 0.5, 0.3)
        end
        if captured.gossip_done_text then
            log(string.format("  Gossip text: \"%s\"", captured.gossip_done_text), 0.3, 1, 0.3)
        else
            log("  Gossip text: not yet captured", 0.7, 0.5, 0.3)
        end
        log("─────────────────────────────────────────────────", 0.4, 0.4, 0.4)
        setupFrame:Show()
    end
end
