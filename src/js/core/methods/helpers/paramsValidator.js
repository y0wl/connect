/* @flow */

import BigNumber from 'bignumber.js';
import { ERRORS } from '../../../constants';
import { fromHardened } from '../../../utils/pathUtils';
import { versionCompare } from '../../../utils/versionUtils';

import DataManager from '../../../data/DataManager';
import type { CoinInfo, FirmwareRange } from '../../../types';

type Param = {
    name: string,
    type?: 'string' | 'number' | 'array' | 'array-buffer' | 'boolean' | 'amount' | 'object',
    obligatory?: boolean,
    allowEmpty?: boolean,
};

const invalidParameter = (message: string) => ERRORS.TypedError('Method_InvalidParameter', message);

export const validateParams = (values: any, fields: Param[]) => {
    fields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(values, field.name)) {
            const value = values[field.name];
            if (field.type) {
                if (field.type === 'array') {
                    if (!Array.isArray(value)) {
                        // invalid type
                        throw invalidParameter(
                            `Parameter "${field.name}" has invalid type. "${field.type}" expected.`,
                        );
                    } else if (!field.allowEmpty && value.length < 1) {
                        throw invalidParameter(`Parameter "${field.name}" is empty.`);
                    }
                } else if (field.type === 'amount') {
                    if (typeof value !== 'string') {
                        throw invalidParameter(
                            `Parameter "${field.name}" has invalid type. "string" expected.`,
                        );
                    }
                    try {
                        const bn = new BigNumber(value);
                        if (bn.toFixed(0) !== value) {
                            throw new Error(''); // catch this in lower block and return proper message
                        }
                    } catch (error) {
                        throw invalidParameter(
                            `Parameter "${field.name}" has invalid value "${value}". Integer representation expected.`,
                        );
                    }
                } else if (field.type === 'array-buffer') {
                    if (!(value instanceof ArrayBuffer)) {
                        throw invalidParameter(
                            `Parameter "${field.name}" has invalid type. "ArrayBuffer" expected.`,
                        );
                    }
                    // eslint-disable-next-line valid-typeof
                } else if (typeof value !== field.type) {
                    // invalid type
                    throw invalidParameter(
                        `Parameter "${field.name}" has invalid type. "${field.type}" expected.`,
                    );
                }
            }
        } else if (field.obligatory) {
            // not found
            throw invalidParameter(`Parameter "${field.name}" is missing.`);
        }
    });
};

export const validateCoinPath = (coinInfo: ?CoinInfo, path: number[]) => {
    if (coinInfo && coinInfo.slip44 !== fromHardened(path[1])) {
        throw invalidParameter('Parameters "path" and "coin" do not match.');
    }
};

export const getFirmwareRange = (
    method: string,
    coinInfo: ?CoinInfo,
    currentRange: FirmwareRange,
) => {
    const current: FirmwareRange = JSON.parse(JSON.stringify(currentRange));
    // set minimum required firmware from coins.json (coinInfo)
    if (coinInfo) {
        if (!coinInfo.support || typeof coinInfo.support.trezor1 !== 'string') {
            current['1'].min = '0';
        } else if (versionCompare(coinInfo.support.trezor1, current['1'].min) > 0) {
            current['1'].min = coinInfo.support.trezor1;
        }

        if (!coinInfo.support || typeof coinInfo.support.trezor2 !== 'string') {
            current['2'].min = '0';
        } else if (versionCompare(coinInfo.support.trezor2, current['2'].min) > 0) {
            current['2'].min = coinInfo.support.trezor2;
        }
    }

    const coinType = coinInfo ? coinInfo.type : null;
    const shortcut = coinInfo ? coinInfo.shortcut.toLowerCase() : null;
    // find firmware range in config.json
    const { supportedFirmware } = DataManager.getConfig();
    const range =
        supportedFirmware.find(
            c =>
                c.coinType === coinType ||
                (Array.isArray(c.coin) && c.coin.includes(shortcut)) ||
                (typeof c.coin === 'string' && c.coin === shortcut),
        ) ||
        supportedFirmware.find(
            c => !c.coinType && !c.coin && c.excludedMethods && c.excludedMethods.includes(method),
        );

    if (range) {
        if (range.excludedMethods && !range.excludedMethods.includes(method)) {
            // not in range. do not change default range
            return current;
        }
        const { min, max } = range;
        // override defaults
        if (min) {
            const [t1, t2] = min;
            if (current['1'].min === '0' || versionCompare(current['1'].min, t1) < 0) {
                current['1'].min = t1;
            }
            if (current['2'].min === '0' || versionCompare(current['2'].min, t2) < 0) {
                current['2'].min = t2;
            }
        }
        if (max) {
            const [t1, t2] = max;
            if (current['1'].max === '0' || versionCompare(current['1'].max, t1) < 0) {
                current['1'].max = t1;
            }
            if (current['2'].max === '0' || versionCompare(current['2'].max, t2) < 0) {
                current['2'].max = t2;
            }
        }
    }

    return current;
};
