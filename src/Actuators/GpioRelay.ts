import * as rpio from "rpio";
import { Relay } from "./Relay";

export class GpioRelay extends Relay {
    constructor(name: string, protected readonly config: GpioRelayConfiguration, log: (msg: string) => void) {
        super(name, log);
        rpio.open(config.pin, rpio.OUTPUT, config.activeValue ? rpio.PULL_DOWN : rpio.PULL_UP);
        process.on('SIGINT', () => rpio.close(this.config.pin));
    }

    public on(): void {
        rpio.write(this.config.pin, this.config.activeValue ? 1 : 0);
    }

    public off(): void {
        rpio.write(this.config.pin, !this.config.activeValue ? 1 : 0);
    }

    public get state(): boolean {
        return (rpio.read(this.config.pin) === 1) === this.config.activeValue;
    }
}

export interface GpioRelayConfiguration {
    pin: number,
    activeValue: boolean,
}