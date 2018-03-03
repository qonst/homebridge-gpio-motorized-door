import { Gpio } from 'onoff';
import { SimpleEventDispatcher, ISimpleEvent } from "strongly-typed-events";
import { Sensor } from "./Sensor";

export class GpioSensor extends Sensor {
    private pin: Gpio;

    private readonly onErrorEvent = new SimpleEventDispatcher<any>();

    constructor(name: string, private readonly config: GpioSensorConfiguration, log: (msg: string) => void) {
        super(name, log);
        this.pin = new Gpio(this.config.pin, "in", "both", { debounceTimeout: 100 });
        this.pin.watch((err, value) => this.stateChanged(err, value));
        process.on('SIGINT', () => this.pin.unexport());
    }

    get active() {
        return this.pin.readSync() === (this.config.activeValue ? 1 : 0);
    }

    private stateChanged(err: any, value: number) {
        // once in a while rpio raises a state changed while the sensor hasn't been activated.
        // rereading the value after a short while acts a guard against a faulty reads
        if (err !== null) {
            this.log(`error; re-read of value differed from first read`);
            this.onErrorEvent.dispatch(err);
            return;
        }

        if (value === (this.config.activeValue ? 1 : 0)) {
            this.log(`activated`);
            this.onSensorActivating.dispatch(this);
        } else {
            this.log(`deactivated`);
            this.onSensorDeactivating.dispatch(this);
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