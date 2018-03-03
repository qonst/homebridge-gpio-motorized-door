import { HomeBridgeGarageDoor } from "./HomeBridgeGarageDoor";

module.exports = function (homebridge)
{
  homebridge.registerAccessory(
    "homebridge-gpio-motorized-door",
    "MotorizedDoor",
    function(log, config){ return new HomeBridgeGarageDoor(homebridge, log, config);});
};