jest.mock('../../lib/knex');
jest.mock('../../models/signal-sets');
jest.mock('../../lib/context-helpers');
jest.mock('../../lib/config');

const { evaluate } = require('../../lib/alerts-condition-parser');

test('constant evaluation bool #1', async () => {
    const result = await evaluate('true', 1);
    expect(result).toBe(true);
});

test('constant evaluation bool #2', async () => {
    const result = await evaluate('false', 1);
    expect(result).toBe(false);
});

test('constant evaluation numbers #1', async () => {
    const result = await evaluate('1+2==4+3', 1);
    expect(result).toBe(false);
});

test('constant evaluation numbers #2', async () => {
    const result = await evaluate('1+2==4-1', 1);
    expect(result).toBe(true);
});

test('constant evaluation strings', async () => {
    const result = await evaluate('equalText("abc", "abc")', 1);
    expect(result).toBe(true);
});

test('constant evaluation for error #1', async () => {
    const result = await evaluate('1+2*3/4', 1);
    expect(result).toBe('NotBoolError');
});

test('constant evaluation for error #2', async () => {
    const result = await evaluate('pseudofunc(123, 45) == 42', 1);
    expect(result).toMatch(/.* is not a function/);
});

test('constant evaluation for error #3', async () => {
    const result = await evaluate('a = 5', 1);
    expect(result).toBe('NotBoolError');
});

test('constant evaluation for error #4', async () => {
    const result = await evaluate('1 + 2 == 3 +', 1);
    expect(result).toBe('Unexpected end of expression (char 13)');
});

test('function declaration #1', async () => {
    const result = await evaluate('mojefun(x) = x * x;\nmojefun(5) == 25', 1);
    expect(result).toBe(true);
});

test('function declaration #2', async () => {
    const result = await evaluate('mojefun(x) = x * x; mojefun(5) == 26', 1);
    expect(result).toBe(false);
});

test('variable declaration #1', async () => {
    const result = await evaluate('mojevar = 1 + 2;\nmojevar == 5 - 2', 1);
    expect(result).toBe(true);
});

test('variable declaration #2', async () => {
    const result = await evaluate('mojevar = 1 + 2; 5 - 3 == mojevar', 1);
    expect(result).toBe(false);
});

test('function and variable declaration', async () => {
    const result = await evaluate('mojefunc(x) = x * x;\nfr(x, y) = x + y;\nmojevar = 6 + 4; vr = 5;\nmojefunc(mojevar) == fr(vr, 95)', 1);
    expect(result).toBe(true);
});

test('past function on regular signal set #1', async () => {
    const result = await evaluate('past("siga", 2) == 96', 1);
    expect(result).toBe(true);
});

test('past function on regular signal set #2', async () => {
    const result = await evaluate('past("siga", 3) == 96', 1);
    expect(result).toBe(false);
});

test('past function on regular signal set #3', async () => {
    const result = await evaluate('past("sigc", 100)', 1);
    expect(result).toBe(true);
});

test('past function on regular signal set #4', async () => {
    const result = await evaluate('past("id", past("siga", 5)) == "8"', 1);
    expect(result).toBe(true);
});

test('avg function on regular signal set #1', async () => {
    const result = await evaluate('avg("siga", 4) != 217.35', 1);
    expect(result).toBe(false);
});

test('avg function on regular signal set #2', async () => {
    const result = await evaluate('avg("siga", 100) == 148.984', 1);
    expect(result).toBe(true);
});

test('avg function on regular signal set #3', async () => {
    const result = await evaluate('avg("sigb", 6) == 148.984', 1);
    expect(result).toBe('Signal in avg function is not numerical!');
});

test('vari function on regular signal set', async () => {
    const result = await evaluate('vari("siga", 4) == 79361.1675', 1);
    expect(result).toBe(true);
});

test('min function on regular signal set #1', async () => {
    const result = await evaluate('min("siga", 8) == -69', 1);
    expect(result).toBe(true);
});

test('min function on regular signal set #2', async () => {
    const result = await evaluate('equalText(min("sigb", 5), "ahoj")', 1);
    expect(result).toBe(true);
});

test('max function on regular signal set #1', async () => {
    const result = await evaluate('max("siga", 8) == 693', 1);
    expect(result).toBe(true);
});

test('max function on regular signal set #2', async () => {
    const result = await evaluate('equalText(max("sigb", 5), "se")', 1);
    expect(result).toBe(true);
});

test('qnt function on regular signal set #1', async () => {
    const result = await evaluate('qnt("siga", 5, 0.5) == 96', 1);
    expect(result).toBe(true);
});

test('qnt function on regular signal set #2', async () => {
    const result = await evaluate('qnt("siga", 5, 1) == 693', 1);
    expect(result).toBe(true);
});

test('qnt function on regular signal set #3', async () => {
    const result = await evaluate('qnt("siga", 5, 0) == -69', 1);
    expect(result).toBe(true);
});

test('qnt function on regular signal set #4', async () => {
    const result = await evaluate('equalText(qnt("sigb", 5, 0.5), "mas")', 1);
    expect(result).toBe(true);
});

test('latest values of regular signal set #1', async () => {
    const result = await evaluate('equalText($id, "9")', 1);
    expect(result).toBe(true);
});

test('latest values of regular signal set #2', async () => {
    const result = await evaluate('$siga == 123', 1);
    expect(result).toBe(true);
});

test('latest values of regular signal set #3', async () => {
    const result = await evaluate('equalText($sigb, "ahoj")', 1);
    expect(result).toBe(true);
});

test('latest values of regular signal set #4', async () => {
    const result = await evaluate('$sigc', 1);
    expect(result).toBe(false);
});

test('latest values of regular signal set #5', async () => {
    const result = await evaluate('$sigc == false', 1);
    expect(result).toBe(true);
});

test('latest values of sparse signal set #1', async () => {
    const result = await evaluate('$siga == 1', 2);
    expect(result).toBe(false);
});

test('latest values of sparse signal set #2', async () => {
    const result = await evaluate('$siga == null', 2);
    expect(result).toBe(true);
});

test('past function on sparse signal set', async () => {
    const result = await evaluate('past("siga", 4) == null', 2);
    expect(result).toBe(true);
});

test('avg function on sparse signal set', async () => {
    const result = await evaluate('avg("siga", 5) == 248.8', 2);
    expect(result).toBe(true);
});

test('vari function on sparse signal set', async () => {
    const result = await evaluate('vari("siga", 5) == 101858.48', 2);
    expect(result).toBe(true);
});

test('min function on sparse signal set #1', async () => {
    const result = await evaluate('min("siga", 4) == -42.6', 2);
    expect(result).toBe(true);
});

test('min function on sparse signal set #2', async () => {
    const result = await evaluate('equalText(min("sigb", 4), "")', 2);
    expect(result).toBe(true);
});

test('max function on sparse signal set #1', async () => {
    const result = await evaluate('max("siga", 2) == -42.6', 2);
    expect(result).toBe(true);
});

test('max function on sparse signal set #2', async () => {
    const result = await evaluate('equalText(max("sigb", 4), "se")', 2);
    expect(result).toBe(true);
});

test('min function null #1', async () => {
    const result = await evaluate('min("siga", 1) == null', 2);
    expect(result).toBe(true);
});

test('min function null #2', async () => {
    const result = await evaluate('min("sigb", 0) == null', 2);
    expect(result).toBe(true);
});

test('max function null #1', async () => {
    const result = await evaluate('max("siga", 1) == null', 2);
    expect(result).toBe(true);
});

test('max function null #2', async () => {
    const result = await evaluate('max("sigb", 0) == null', 2);
    expect(result).toBe(true);
});

test('qnt function on sparse signal set #1', async () => {
    const result = await evaluate('qnt("siga", 6, 0.5) == 1', 2);
    expect(result).toBe(true);
});

test('qnt function on sparse signal set #2', async () => {
    const result = await evaluate('equalText(qnt("sigb", 6, 0.5), "ahoj")', 2);
    expect(result).toBe(true);
});

test('complicated formula #1', async () => {
    const formula = 'a = $siga - 23;\nb = $sigb\nf(x, y) = 3 * x^2 + y + 5;\npast("sigc", 3) ? c = "neco" : c = "ahoj";\nf(a, 6) == 30011 and (not equalText(b, c))';
    const result = await evaluate(formula, 1);
    expect(result).toBe(true);
});

test('complicated formula #2', async () => {
    const formula = 'a = $siga - 23;\nb = $sigb\nf(x, y) = 3 * x^2 + y + 5;\npast("sigc", 3) ? c = "neco" : c = "ahoj";\nf(a, 6) == 30011 and (not equalText(b, c))\n1 + 2';
    const result = await evaluate(formula, 1);
    expect(result).toBe('NotBoolError');
});

test('empty condition', async () => {
    const result = await evaluate('', 1);
    expect(result).toBe('NotBoolError');
});

test('white space condition', async () => {
    const result = await evaluate('        ', 1);
    expect(result).toBe('NotBoolError');
});

test('multiline white space condition', async () => {
    const result = await evaluate('    \n     ;\n\n;\n    ', 1);
    expect(result).toBe('NotBoolError');
});

test('undefined condition', async () => {
    const result = await evaluate(undefined, 1);
    expect(result).toMatch(/Unexpected type of argument .*/);
});

test('null condition', async () => {
    const result = await evaluate(null, 1);
    expect(result).toMatch(/Unexpected type of argument .*/);
});

test('past function zero distance', async () => {
    const result = await evaluate('past("siga", 0) == 123', 1);
    expect(result).toBe(true);
});

test('past function -1 distance', async () => {
    const result = await evaluate('past("siga", -1) == 123', 1);
    expect(result).toMatch(/Cannot read property .*/);
});

test('avg function zero length', async () => {
    const result = await evaluate('avg("siga", 0) == 123', 1);
    expect(result).toBe(false);
});

test('avg function -1 length', async () => {
    const result = await evaluate('avg("siga", -1) == 123', 1);
    expect(result).toBe(false);
});

test('vari function not numeric', async () => {
    const result = await evaluate('vari("id", 5) == 123', 1);
    expect(result).toBe('Signal in vari function is not numerical!');
});

test('vari function -1 length', async () => {
    const result = await evaluate('vari("id", -1) == 123', 1);
    expect(result).toBe(false);
});

test('max function -1 length', async () => {
    const result = await evaluate('max("id", -1) == null', 1);
    expect(result).toBe(true);
});

test('min function -1 length', async () => {
    const result = await evaluate('min("id", -1) == null', 1);
    expect(result).toBe(true);
});

test('qnt function -1 length', async () => {
    const result = await evaluate('qnt("siga", -1, 0.5) == undefined', 1);
    expect(result).toBe(true);
});

test('qnt function q = 3 and q = -1', async () => {
    const result = await evaluate('qnt("siga", 10, 3) == undefined and qnt("siga", 10, -1) == -69', 1);
    expect(result).toBe(true);
});

test('qnt function over length', async () => {
    const result = await evaluate('qnt("siga", 10000, 0.3) != qnt("siga", 10, 0.3)', 1);
    expect(result).toBe(false);
});

test('vari function over length', async () => {
    const result = await evaluate('vari("siga", 10000) == vari("siga", 10)', 1);
    expect(result).toBe(true);
});

test('past function over length', async () => {
    const result = await evaluate('past("id", 10000) == past("id", 9)', 1);
    expect(result).toBe(true);
});
