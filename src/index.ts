import { HomeBridgeGarageDoor, HomebridgeDoorConfiguration } from "./HomeBridgeGarageDoor";
export { HomeBridgeGarageDoor, HomebridgeDoorConfiguration }

module.exports = function (homebridge: any) {
  homebridge.registerAccessory(
    "homebridge-gpio-motorized-door",
    "MotorizedDoor",
    function (log: (msg: string) => void, config: HomebridgeDoorConfiguration) { return new HomeBridgeGarageDoor(homebridge, config, log); });
};