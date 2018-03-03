var Service;
var Characteristic;
import { MotorizedDoor, DoorConfiguration, TargetState, CurrentState } from "./MotorizedDoor";

export class HomeBridgeGarageDoor extends MotorizedDoor {
    /** suppress sensor events (used when homekit triggerede the movement of the door) */
    private suppressEvent: boolean = false;
    /** homebridge service for accessory type info */
    private readonly infoService: any;
    /** Homebridge service for the door */
    private readonly garageDoorService: any;

    constructor(homebridge: any, log: LogFunction, config: HomebridgeDoorConfiguration) {
        super(log, config);

        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;

        config.type = Object.assign(
            {},
            {
                manufacturer: "Opensource Community",
                model: "RaspPi GPIO GarageDoor",
                serialNumber: "Version 2.0.0"
            },
            config.type);

        this.garageDoorService = new Service.GarageDoorOpener(this.config.name, this.config.name);

        let currentDoorState = this.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState);
        currentDoorState.on("get", (callback: getCallback<CurrentState>): void => callback(null, this.currentState));

        let targetDoorState = this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState);
        targetDoorState.on("set", (newValue, callback) => this.setTargetState(newValue, callback));
        targetDoorState.on("get", (callback: getCallback<TargetState>): void => callback(null, this.targetState));

        this.infoService = new Service.AccessoryInformation();
        this.infoService
            .setCharacteristic(Characteristic.Manufacturer, config.type.manufacturer)
            .setCharacteristic(Characteristic.Model, config.type.model)
            .setCharacteristic(Characteristic.SerialNumber, config.type.serialNumber);

        switch (this.currentState) {
            case CurrentState.OPEN:
                targetDoorState.updateValue(TargetState.OPEN);
                currentDoorState.updateValue(CurrentState.OPEN);
            case CurrentState.CLOSED:
                targetDoorState.updateValue(TargetState.CLOSED);
                currentDoorState.updateValue(CurrentState.CLOSED);
                break;
        }

        var transitioning = () => {
            this.log(`Transitioning to ${MotorizedDoor.doorStateToString(this.targetState)}`);
            if (!this.suppressEvent) {
                targetDoorState.updateValue(this.targetState);
                currentDoorState.updateValue(this.currentState);

            }
        };
        var reachedTarget = () => {
            this.log(`Reached ${MotorizedDoor.doorStateToString(this.currentState)}`);
            currentDoorState.updateValue(this.currentState);
            this.suppressEvent = false;
        };

        this.onClosed.subscribe(reachedTarget);
        this.onOpened.subscribe(reachedTarget);
        this.onOpening.subscribe(transitioning);
        this.onClosing.subscribe(transitioning);
    }

    private setTargetState(state: TargetState, callback: setCallback): void {
        if (state === this.targetState && !this.stopped) {
            this.log("Already at target state");
            return;
        }
        this.suppressEvent = true;
        this.log(`New state ${MotorizedDoor.doorStateToString(state)}, was ${MotorizedDoor.doorStateToString(this.currentState)}`);
        switch (state) {
            case TargetState.CLOSED:
                this.close();
                break;
            case TargetState.OPEN:
                this.open();
                break;
            default:
                this.log(`Unhandled state: ${MotorizedDoor.doorStateToString(state)}`);
        }

        callback(null);
    }

    getServices() {
        return [this.infoService, this.garageDoorService];
    }
}

export interface HomebridgeDoorConfiguration extends DoorConfiguration {
    type?: {
        manufacturer?: string;
        model?: string;
        serialNumber?: string;
    };
}

type getCallback<T> = (err: any, newValue: T) => void;

type setCallback = (err: any) => void;