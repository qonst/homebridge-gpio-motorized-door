import * as rpio from "rpio";
import { SimpleEventDispatcher } from "strongly-typed-events";
import { Sensor } from "./Sensor";

export class GpioSensor extends Sensor {

    private readonly onErrorEvent: SimpleEventDispatcher<boolean>;
    private confirmTimeout: NodeJS.Timer;

    constructor(name: string, readonly config: GpioSensorConfiguration) {
        super(name);
        rpio.open(this.config.pin, rpio.INPUT, this.config.activeValue ? rpio.PULL_DOWN : rpio.PULL_UP);
        rpio.poll(this.config.pin, (pin) => this.stateChanged(pin), rpio.POLL_BOTH);
        this.confirmTimeout = null;
    }

    get active() {
        return rpio.read(this.config.pin) === (this.config.activeValue ? 1 : 0);
    }

    private stateChanged(pin): void {
        if (this.confirmTimeout !== null) {
            clearTimeout(this.confirmTimeout);
        }
        this.confirmTimeout = setTimeout(() => this.confirmState(this.active), 100);
    }

    private confirmState(triggeredeValue: boolean): void {
        if (this.confirmTimeout !== null) {
            clearTimeout(this.confirmTimeout);
        }
        // once in a while rpio raises a state changed while the sensor hasn't been activated.
        // rereading the value after a short while acts a guard against a faulty reads
        if (triggeredeValue === this.active) {
            if (triggeredeValue) {
                this.onSensorActivating.dispatch(this);
            } else {
                this.onSensorDeactivating.dispatch(this);
            }
        } else {
            this.onErrorEvent.dispatch(triggeredeValue);
        }
    }

    public onError() {
        return this.onErrorEvent.asEvent();
    }
}

export interface GpioSensorConfiguration {
    pin: number,
    activeValue: boolean
}