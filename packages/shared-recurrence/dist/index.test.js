"use strict";
// Ported from sheets/test/budgetsUpcoming.test.js's coverage of the
// original Code.gs logic this module replaces — same cases, same expected
// dates, confirming the port is behavior-identical.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("./index");
(0, node_test_1.default)('nextOccurrenceOnOrAfter finds the next monthly occurrence within the horizon', () => {
    const rule = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 15) };
    const from = new Date(2026, 7, 1);
    const until = new Date(from.getTime() + 60 * 24 * 3600 * 1000);
    const next = (0, index_1.nextOccurrenceOnOrAfter)(rule, from, until);
    strict_1.default.ok(next);
    strict_1.default.equal(next.getFullYear(), 2026);
    strict_1.default.equal(next.getMonth(), 7); // August
    strict_1.default.equal(next.getDate(), 15);
});
(0, node_test_1.default)('nextOccurrenceOnOrAfter excludes a Once rule whose single occurrence already passed', () => {
    const rule = { frequency: 'Once', anchorDate: new Date(2026, 0, 1) };
    const from = new Date(2026, 7, 1);
    const until = new Date(from.getTime() + 60 * 24 * 3600 * 1000);
    strict_1.default.equal((0, index_1.nextOccurrenceOnOrAfter)(rule, from, until), null);
});
(0, node_test_1.default)('nextOccurrenceOnOrAfter finds a weekly occurrence on or after `from`', () => {
    const rule = { frequency: 'Weekly', interval: 1, anchorDate: new Date(2026, 7, 3) };
    const from = new Date(2026, 7, 1);
    const until = new Date(from.getTime() + 14 * 24 * 3600 * 1000);
    const next = (0, index_1.nextOccurrenceOnOrAfter)(rule, from, until);
    strict_1.default.ok(next);
    strict_1.default.equal(next.getDate(), 3);
});
(0, node_test_1.default)('nextOccurrenceOnOrAfter respects "After Occurrences" — excludes a rule that already ended', () => {
    const rule = {
        frequency: 'Monthly',
        interval: 1,
        anchorDate: new Date(2026, 0, 15),
        endCondition: 'After Occurrences',
        endOccurrences: 1,
    };
    const from = new Date(2026, 7, 1);
    const until = new Date(from.getTime() + 60 * 24 * 3600 * 1000);
    strict_1.default.equal((0, index_1.nextOccurrenceOnOrAfter)(rule, from, until), null);
});
(0, node_test_1.default)('nextOccurrenceOnOrAfter sorts multiple rules soonest-first (by comparing dates)', () => {
    const sooner = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 5) };
    const later = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 25) };
    const from = new Date(2026, 7, 1);
    const until = new Date(from.getTime() + 30 * 24 * 3600 * 1000);
    const a = (0, index_1.nextOccurrenceOnOrAfter)(sooner, from, until);
    const b = (0, index_1.nextOccurrenceOnOrAfter)(later, from, until);
    strict_1.default.ok(a < b);
});
(0, node_test_1.default)('ruleAppliesToMonth: a Monthly rule applies every month from its anchor onward', () => {
    const rule = { frequency: 'Monthly', interval: 1, anchorDate: new Date(2026, 0, 15) };
    strict_1.default.equal((0, index_1.ruleAppliesToMonth)(rule, 2025, 12), null); // before anchor
    const jan = (0, index_1.ruleAppliesToMonth)(rule, 2026, 1);
    strict_1.default.deepEqual(jan, { occurrenceIndex: 1, multiplier: 1 });
    const aug = (0, index_1.ruleAppliesToMonth)(rule, 2026, 8);
    strict_1.default.deepEqual(aug, { occurrenceIndex: 8, multiplier: 1 });
});
(0, node_test_1.default)('ruleAppliesToMonth: interval 2 Monthly applies every other month', () => {
    const rule = { frequency: 'Monthly', interval: 2, anchorDate: new Date(2026, 0, 15) };
    strict_1.default.ok((0, index_1.ruleAppliesToMonth)(rule, 2026, 1)); // Jan: occurrence 1
    strict_1.default.equal((0, index_1.ruleAppliesToMonth)(rule, 2026, 2), null); // Feb: skipped
    strict_1.default.ok((0, index_1.ruleAppliesToMonth)(rule, 2026, 3)); // Mar: occurrence 2
});
(0, node_test_1.default)('nextOccurrenceOnOrAfter finds a daily occurrence on or after `from`', () => {
    const rule = { frequency: 'Daily', interval: 1, anchorDate: new Date(2026, 7, 1) };
    const from = new Date(2026, 7, 5);
    const until = new Date(from.getTime() + 3 * 24 * 3600 * 1000);
    const next = (0, index_1.nextOccurrenceOnOrAfter)(rule, from, until);
    strict_1.default.ok(next);
    strict_1.default.equal(next.getDate(), 5); // Daily always lands on `from` itself
});
(0, node_test_1.default)('nextOccurrenceOnOrAfter respects interval > 1 for a Daily rule (every 3rd day)', () => {
    const rule = { frequency: 'Daily', interval: 3, anchorDate: new Date(2026, 7, 1) };
    const from = new Date(2026, 7, 2);
    const until = new Date(from.getTime() + 10 * 24 * 3600 * 1000);
    const next = (0, index_1.nextOccurrenceOnOrAfter)(rule, from, until);
    strict_1.default.ok(next);
    strict_1.default.equal(next.getDate(), 4); // anchor Aug 1, next occurrence Aug 4
});
(0, node_test_1.default)('ruleAppliesToMonth: a Daily rule lands once for every day of the month it covers', () => {
    const rule = { frequency: 'Daily', interval: 1, anchorDate: new Date(2026, 7, 1) };
    const aug = (0, index_1.ruleAppliesToMonth)(rule, 2026, 8);
    strict_1.default.ok(aug);
    strict_1.default.equal(aug.multiplier, 31); // every day in August
});
(0, node_test_1.default)('ruleAppliesToMonth: a Weekly rule can land more than once in the same month', () => {
    const rule = { frequency: 'Weekly', interval: 1, anchorDate: new Date(2026, 7, 3) };
    const aug = (0, index_1.ruleAppliesToMonth)(rule, 2026, 8);
    strict_1.default.ok(aug);
    strict_1.default.ok(aug.multiplier >= 4); // ~4-5 Mondays in August 2026
});
(0, node_test_1.default)('ruleAppliesToMonth: "On Date" end condition stops future months', () => {
    const rule = {
        frequency: 'Monthly',
        interval: 1,
        anchorDate: new Date(2026, 0, 15),
        endCondition: 'On Date',
        endDate: new Date(2026, 5, 30),
    };
    strict_1.default.ok((0, index_1.ruleAppliesToMonth)(rule, 2026, 6)); // June: still within end date
    strict_1.default.equal((0, index_1.ruleAppliesToMonth)(rule, 2026, 7), null); // July: past end date
});
