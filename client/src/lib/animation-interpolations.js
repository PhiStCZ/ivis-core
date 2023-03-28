import Spline from "cubic-spline";
import memoize from "memoizee/weak";

function linearIntpFunction(xs, ys, x) {
    const ratio = (xs[1] - x)/(xs[1] - xs[0]);

    return ys[0] * ratio + ys[1] * (1 - ratio);
}

export const linearInterpolation = {
    arity: 2,
    func: linearIntpFunction,
};

function getCubicSpline(xs, ys) {
    return new Spline(xs, ys);
}

const getCubicSplineMemoized = memoize(getCubicSpline);

function cubicSplineIntpFunction(xs, ys, x) {
    return getCubicSplineMemoized(xs, ys).at(x);
}

export const cubicInterpolation = {
    arity: 3,
    func: cubicSplineIntpFunction,
};

export const expensiveCubicInterpolation = {
    arity: 10,
    func: cubicSplineIntpFunction,
};
