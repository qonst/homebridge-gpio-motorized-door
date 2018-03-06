import { IRelay } from "./Relay";

export class PulseDecorator implements IRelay {

    constructor(private readonly relay: IRelay, private readonly cycle: number) {
    }

    on(pulse = 1, cycleTime = this.cycle) {
        this.pulse(pulse, cycleTime);
    }

    off(): void {
        this.relay.off();
    }

    private pulse(count: number, cycleTime: number): void {
        if (count === 0) {
            return;
        }
        this.relay.on();
        setTimeout(() => {
            this.relay.off();
            count -= 1;
            if (count > 0) {
                setTimeout(() => this.pulse(count, cycleTime), cycleTime);
            }
        }, cycleTime);
    }
}