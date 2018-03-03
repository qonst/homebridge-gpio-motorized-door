"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Service;
var Characteristic;
const MotorizedDoor_1 = require("./MotorizedDoor");
class HomeBridgeGarageDoor extends MotorizedDoor_1.MotorizedDoor {
    constructor(homebridge, log, config) {
        super(log, config);
        /** suppress sensor events (used when homekit triggerede the movement of the door) */
        this.suppressEvent = false;
        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;
        config.type = Object.assign({}, {
            manufacturer: "Opensource Community",
            model: "RaspPi GPIO GarageDoor",
            serialNumber: "Version 2.0.0"
        }, config.type);
        this.garageDoorService = new Service.GarageDoorOpener(this.config.name, this.config.name);
        let currentDoorState = this.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState);
        currentDoorState.on("get", (callback) => callback(null, this.currentState));
        let targetDoorState = this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState);
        targetDoorState.on("set", (newValue, callback) => this.setTargetState(newValue, callback));
        targetDoorState.on("get", (callback) => callback(null, this.targetState));
        this.infoService = new Service.AccessoryInformation();
        this.infoService
            .setCharacteristic(Characteristic.Manufacturer, config.type.manufacturer)
            .setCharacteristic(Characteristic.Model, config.type.model)
            .setCharacteristic(Characteristic.SerialNumber, config.type.serialNumber);
        switch (this.currentState) {
            case MotorizedDoor_1.CurrentState.OPEN:
                targetDoorState.updateValue(MotorizedDoor_1.TargetState.OPEN);
                currentDoorState.updateValue(MotorizedDoor_1.CurrentState.OPEN);
            case MotorizedDoor_1.CurrentState.CLOSED:
                targetDoorState.updateValue(MotorizedDoor_1.TargetState.CLOSED);
                currentDoorState.updateValue(MotorizedDoor_1.CurrentState.CLOSED);
                break;
        }
        var transitioning = () => {
            this.log(`Transitioning to ${MotorizedDoor_1.MotorizedDoor.doorStateToString(this.targetState)}`);
            if (!this.suppressEvent) {
                targetDoorState.updateValue(this.targetState);
                currentDoorState.updateValue(this.currentState);
            }
        };
        var reachedTarget = () => {
            this.log(`Reached ${MotorizedDoor_1.MotorizedDoor.doorStateToString(this.currentState)}`);
            currentDoorState.updateValue(this.currentState);
            this.suppressEvent = false;
        };
        this.onClosed.subscribe(reachedTarget);
        this.onOpened.subscribe(reachedTarget);
        this.onOpening.subscribe(transitioning);
        this.onClosing.subscribe(transitioning);
    }
    setTargetState(state, callback) {
        if (state === this.targetState && !this.stopped) {
            this.log("Already at target state");
            return;
        }
        this.suppressEvent = true;
        this.log(`New state ${MotorizedDoor_1.MotorizedDoor.doorStateToString(state)}, was ${MotorizedDoor_1.MotorizedDoor.doorStateToString(this.currentState)}`);
        switch (state) {
            case MotorizedDoor_1.TargetState.CLOSED:
                this.close();
                break;
            case MotorizedDoor_1.TargetState.OPEN:
                this.open();
                break;
            default:
                this.log(`Unhandled state: ${MotorizedDoor_1.MotorizedDoor.doorStateToString(state)}`);
        }
        callback(null);
    }
    getServices() {
        return [this.infoService, this.garageDoorService];
    }
}
exports.HomeBridgeGarageDoor = HomeBridgeGarageDoor;
//# sourceMappingURL=HomeBridgeGarageDoor.js.map