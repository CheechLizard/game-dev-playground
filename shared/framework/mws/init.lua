-- Modular Weapon System.
--
-- A weapon is a directed graph of modules. Firing sends events through it;
-- modules read and write the strike state the event carries; STRIKER hands
-- finished strikes to the host game to simulate. See docs/mws.md.

local mws = {}

mws.modules = require("framework.mws.modules")
mws.graph   = require("framework.mws.graph")
mws.runtime = require("framework.mws.runtime")

return mws
