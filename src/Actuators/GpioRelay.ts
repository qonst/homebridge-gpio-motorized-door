import { Gpio, GpioOptions } from "onoff";
import { Relay } from "./Relay";

export class GpioRelay extends Relay {
    private pin: Gpio;
    constructor(name: string, protected readonly config: GpioRelayConfiguration, log: (msg: string) => void) {
        super(name, log);
        this.pin = new Gpio(this.config.pin, 'out');
        this.off();
        process.on('SIGINT', () => this.pin.unexport());
    }

    public on(): void {
        this.pin.writeSync(this.config.activeValue ? 1 : 0);
    }

    public off(): void {
        this.pin.writeSync(!this.config.activeValue ? 1 : 0);
    }

    public get state(): boolean {
        return this.pin.readSync() === (this.config.activeValue ? 1 : 0);
    }
}

export interface GpioRelayConfiguration {
    pin: number,
    activeValue: boolean,
}