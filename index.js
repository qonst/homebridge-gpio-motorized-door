"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HomeBridgeGarageDoor_1 = require("./HomeBridgeGarageDoor");
module.exports = function (homebridge) {
    homebridge.registerAccessory("homebridge-gpio-motorized-door", "MotorizedDoor", function (log, config) { return new HomeBridgeGarageDoor_1.HomeBridgeGarageDoor(homebridge, log, config); });
};
//# sourceMappingURL=index.js.map