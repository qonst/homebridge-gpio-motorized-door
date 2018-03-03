import * as rpio from "rpio";
import { Relay } from "./Relay";

export class GpioRelay extends Relay {
    constructor(name: string, protected readonly config: GpioRelayConfiguration, log: (msg: string) => void) {
        super(name, log);
        rpio.open(this.config.pin, rpio.OUTPUT, this.config.activeValue ? rpio.PULL_DOWN : rpio.PULL_UP);
    }

    public on(): void {
        rpio.write(this.config.pin, this.config.activeValue ? rpio.HIGH : rpio.LOW);
    }

    public off(): void {
        rpio.write(this.config.pin, !this.config.activeValue ? rpio.HIGH : rpio.LOW);
    }

    public get state(): boolean {
        return rpio.read(this.config.pin) === (this.config.activeValue ? rpio.HIGH : rpio.LOW);
    }
}

export interface GpioRelayConfiguration {
    pin: number,
    activeValue: boolean,
}