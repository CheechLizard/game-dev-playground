-- Modular Weapon System.
--
-- A weapon is a directed graph of modules. Firing sends events through it;
-- modules read and write the strike state the event carries; STRIKER hands
-- finished strikes to the host game to simulate. See
-- docs/Modular_Weapon_System.md and docs/MWS_Implementation.md for the
-- revised design and which parts of its migration are implemented.

local mws = {}

mws.modules = require("framework.mws.modules")
mws.graph   = require("framework.mws.graph")
mws.runtime = require("framework.mws.runtime")
mws.input   = require("framework.mws.input")
mws.triggers = require("framework.mws.triggers")
mws.v2runtime = require("framework.mws.v2runtime")

return mws
