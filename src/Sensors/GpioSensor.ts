import { SimpleEventDispatcher, ISimpleEvent } from "strongly-typed-events";
import { Sensor } from "./Sensor";
import * as rpio from "rpio";

export class GpioSensor extends Sensor {

    private readonly onErrorEvent = new SimpleEventDispatcher<any>();

    constructor(name: string, private readonly config: GpioSensorConfiguration, log: (msg: string) => void) {
        super(name, log);
        rpio.open(this.config.pin, this.config.activeValue ? rpio.PULL_DOWN : rpio.PULL_UP);
        rpio.poll(this.config.pin, (pin) => this.stateChanged(pin), rpio.POLL_BOTH);
        process.on('SIGINT', () => rpio.close(this.config.pin));
    }

    get active() {
        return (rpio.read(this.config.pin) === rpio.HIGH) === this.config.activeValue;
    }

    private stateChanged(pin: number) {
        if (pin !== this.config.pin) {
            return;
        }
        var value = (rpio.read(this.config.pin) === rpio.HIGH) === this.config.activeValue;
        setTimeout(() => { // Debounce
            if (value === (rpio.read(this.config.pin) === rpio.HIGH) === this.config.activeValue) {
                if (value) {
                    this.onSensorActivating.dispatch(this);
                } else {
                    this.onSensorDeactivating.dispatch(this);
                }
            } else {
                this.onSensorDeactivating.dispatch(this);
            }
        }, 100);
    }

    public onError() {
        return this.onErrorEvent.asEvent();
    }
}

export interface GpioSensorConfiguration {
    pin: number,
    activeValue: boolean
}