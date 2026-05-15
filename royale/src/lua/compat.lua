-- Lua 5.1/LuaJIT → Lua 5.3 compatibility shims.
-- Load this before LibStub / LibSerialize to patch missing globals.

-- In Lua 5.1 (WoW), unpack is a global; in 5.3 it moved to table.unpack
if not unpack then
  unpack = table.unpack
end

-- LuaJIT's "bit" library — emulate with Lua 5.3 bitwise operators
if not bit then
  bit = {
    band    = function(a, b, ...) local r = a & b; if ... then return bit.band(r, ...) end return r end,
    bor     = function(a, b, ...) local r = a | b; if ... then return bit.bor(r, ...)  end return r end,
    bxor    = function(a, b, ...) local r = a ~ b; if ... then return bit.bxor(r, ...) end return r end,
    bnot    = function(a)  return ~a end,
    lshift  = function(a, n) return a << n end,
    rshift  = function(a, n) return a >> n end,
    arshift = function(a, n) return a >> n end,
    tobit   = function(a)    return a & 0xffffffff end,
    tohex   = function(a, n) return string.format(n and ("%0"..n.."x") or "%x", a & 0xffffffff) end,
  }
end

-- Lua 5.1 loadstring → Lua 5.3 load
if not loadstring then
  loadstring = load
end
