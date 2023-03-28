import moment from "moment";

export class SigSetInterpolator {
    constructor(signalCids, aggs, intp) {
        this.signalCids = signalCids;
        this.aggs = aggs;
        this.func = intp.func;
        this.arity = intp.arity;

        this.clearArgs();
    }

    rebuildArgs(keyframes, startIdx = 0) {
        this.clearArgs();
        const adjArity = startIdx + this.arity;

        if (keyframes.length < adjArity) return;
        const getArgsForAgg = (sigCid, agg) => {
            const args = [];
            for (let i = startIdx; i < adjArity; i++) {
                args.push(keyframes[i].data[sigCid][agg]);
            }

            return args;
        };

        for (const sigCid of this.signalCids) {
            const signalArgs = {};
            for (const agg of this.aggs) {
                signalArgs[agg] = getArgsForAgg(sigCid, agg);
            }

            this.dataArgs[sigCid] = signalArgs;
        }

        this.tsArgs = [];
        for (let i = startIdx; i < adjArity; i++) {
            const ts = keyframes[i].ts;
            this.tsArgs.push(moment.isMoment(ts) ? ts.valueOf() : ts);
        }

        this.hasCachedArgs = true;
    }

    interpolate(ts) {
        let forceNull = !this.hasCachedArgs ||
            this.tsArgs[0] > ts || this.tsArgs[this.tsArgs.length - 1] < ts;

        const interpolateAgg = (sigCid, agg) => forceNull ? null : this.func(this.tsArgs, this.dataArgs[sigCid][agg], ts);

        for (const sigCid of this.signalCids) {
            const sigResults = {};
            for (const agg of this.aggs) {
                sigResults[agg] = interpolateAgg(sigCid, agg);
            }

            this.results[sigCid] = sigResults;
        }

        return this.results;
    }

    clearArgs() {
        this.dataArgs = {};
        this.tsArgs = [];

        this.results = {};
        this.hasCachedArgs = false;
    }
}
