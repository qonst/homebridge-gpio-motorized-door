import * as rpio from "rpio";

export class Relay {
    constructor(readonly log: LogFunction, protected readonly config: RelayConfiguration) {
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

export class PulseRelay extends Relay {

    constructor(readonly log: LogFunction, protected readonly config: PulseRelayConfiguration) {
        super(log, config);
    }

    public on(pulse = 1, cycleTime = this.config.cycle) {
        this.pulse(pulse, cycleTime);
    }

    private pulse(count: number, cycleTime: number): void {
        if (count === 0) {
            return;
        }
        super.on();
        setTimeout(() => {
            super.off();
            count -= 1;
            if (count > 0) {
                setTimeout(() => this.pulse(count, cycleTime), cycleTime);
            }
        }, cycleTime);
    }
}

export interface RelayConfiguration {
    pin: number,
    activeValue: boolean,
}

export interface PulseRelayConfiguration extends RelayConfiguration {
    cycle: number
}