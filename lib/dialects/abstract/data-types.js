'use strict';

/*
  The data types inside here contain common logic for dialects that they can override at will.
  The user is not interacting with these classes here, but with the ones in lib/data-types.
  In fact, the classes here are never instantiated, but only delegated to via .call()/.apply()
  to allow for custom data type parsers/stringifiers.
*/

/*jshint -W110 */

const util = require('util');
const inherits = require('./utils/inherits');
const _ = require('lodash');
const Wkt = require('terraformer-wkt-parser');
const sequelizeErrors = require('./errors');
const warnings = {};
const Validator = require('./utils/validator-extras').validator;
const momentTz = require('moment-timezone');
const moment = require('moment');

function ABSTRACT() {}

ABSTRACT.prototype.dialectTypes = '';

ABSTRACT.prototype.toString = function toString(options) {
  return this.toSql(options);
};
ABSTRACT.prototype.toSql = function toSql() {
  return this.key;
};
ABSTRACT.warn = function warn(link, text) {
};
ABSTRACT.parse = function parse(value, options) {
  return value;
};
ABSTRACT.prototype.stringify = function stringify(value, options) {
  return value;
};

function STRING() {}
inherits(STRING, ABSTRACT);

STRING.prototype.key = STRING.key = 'STRING';
STRING.prototype.toSql = function toSql() {
  return 'VARCHAR(' + this._length + ')' + ((this._binary) ? ' BINARY' : '');
};

function CHAR() {}
inherits(CHAR, STRING);

CHAR.prototype.key = CHAR.key = 'CHAR';
CHAR.prototype.toSql = function toSql() {
  return 'CHAR(' + this._length + ')' + ((this._binary) ? ' BINARY' : '');
};

function TEXT() {}
inherits(TEXT, ABSTRACT);

TEXT.prototype.key = TEXT.key = 'TEXT';
TEXT.prototype.toSql = function toSql() {
  switch (this._length.toLowerCase()) {
    case 'tiny':
      return 'TINYTEXT';
    case 'medium':
      return 'MEDIUMTEXT';
    case 'long':
      return 'LONGTEXT';
    default:
      return this.key;
  }
};
TEXT.prototype.validate = function validate(value) {
  if (!_.isString(value)) {
    throw new sequelizeErrors.ValidationError(util.format('%j is not a valid string', value));
  }

  return true;
};

function NUMBER() {}
inherits(NUMBER, ABSTRACT);

NUMBER.prototype.key = NUMBER.key = 'NUMBER';
NUMBER.prototype.toSql = function toSql() {
  let result = this.key;
  if (this._length) {
    result += '(' + this._length;
    if (typeof this._decimals === 'number') {
      result += ',' + this._decimals;
    }
    result += ')';
  }
  if (this._unsigned) {
    result += ' UNSIGNED';
  }
  if (this._zerofill) {
    result += ' ZEROFILL';
  }
  return result;
};

function INTEGER() {}
inherits(INTEGER, NUMBER);
INTEGER.prototype.key = INTEGER.key = 'INTEGER';

function BIGINT() {}
inherits(BIGINT, NUMBER);
BIGINT.prototype.key = BIGINT.key = 'BIGINT';

function FLOAT() {}
inherits(FLOAT, NUMBER);
FLOAT.prototype.key = FLOAT.key = 'FLOAT';

function REAL() {}
inherits(REAL, NUMBER);
REAL.prototype.key = REAL.key = 'REAL';

function DOUBLE() {}
inherits(DOUBLE, NUMBER);
DOUBLE.prototype.key = DOUBLE.key = 'DOUBLE PRECISION';

function DECIMAL() {}
inherits(DECIMAL, NUMBER);
DECIMAL.prototype.key = DECIMAL.key = 'DECIMAL';
DECIMAL.prototype.toSql = function toSql() {

  if (this._precision || this._scale) {
    return 'DECIMAL(' + [this._precision, this._scale].filter(_.identity).join(',') + ')';
  }

  return 'DECIMAL';
};

for (const floating of [FLOAT, DOUBLE, REAL]) {
  floating.prototype.escape = false;
  floating.prototype.stringify = function stringify(value) {
    if (isNaN(value)) {
      return "'NaN'";
    } else if (!isFinite(value)) {
      const sign = value < 0 ? '-' : '';
      return "'" + sign + "Infinity'";
    }

    return value;
  };
}

function BOOLEAN() {}
inherits(BOOLEAN, ABSTRACT);

BOOLEAN.prototype.key = BOOLEAN.key = 'BOOLEAN';
BOOLEAN.prototype.toSql = function toSql() {
  return 'TINYINT(1)';
};

function TIME() {}
inherits(TIME, ABSTRACT);
TIME.prototype.key = TIME.key = 'TIME';
TIME.prototype.toSql = function toSql() {
  return 'TIME';
};

function DATE() {}
inherits(DATE, ABSTRACT);
DATE.prototype.key = DATE.key = 'DATE';
DATE.prototype.toSql = function toSql() {
  return 'DATETIME';
};
DATE.prototype._applyTimezone = function _applyTimezone(date, options) {
  if (options.timezone) {
    if (momentTz.tz.zone(options.timezone)) {
      date = momentTz(date).tz(options.timezone);
    } else {
      date = moment(date).utcOffset(options.timezone);
    }
  } else {
    date = momentTz(date);
  }

  return date;
};

DATE.prototype.stringify = function stringify(date, options) {
  date = this._applyTimezone(date, options);

  // Z here means current timezone, _not_ UTC
  return date.format('YYYY-MM-DD HH:mm:ss.SSS Z');
};

function DATEONLY() {}
util.inherits(DATEONLY, ABSTRACT);

DATEONLY.prototype.key = DATEONLY.key = 'DATEONLY';
DATEONLY.prototype.toSql = function() {
  return 'DATE';
};

function HSTORE() {}
inherits(HSTORE, ABSTRACT);
HSTORE.prototype.key = HSTORE.key = 'HSTORE';

function JSONTYPE() {}
inherits(JSONTYPE, ABSTRACT);
JSONTYPE.prototype.key = JSONTYPE.key = 'JSON';
JSONTYPE.prototype.stringify = function stringify(value, options) {
  return JSON.stringify(value);
};

function JSONB() {}
inherits(JSONB, JSONTYPE);
JSONB.prototype.key = JSONB.key = 'JSONB';

function NOW() {}
inherits(NOW, ABSTRACT);

NOW.prototype.key = NOW.key = 'NOW';

function BLOB() {}
inherits(BLOB, ABSTRACT);
BLOB.prototype.key = BLOB.key = 'BLOB';
BLOB.prototype.toSql = function toSql() {
  switch (this._length.toLowerCase()) {
    case 'tiny':
      return 'TINYBLOB';
    case 'medium':
      return 'MEDIUMBLOB';
    case 'long':
      return 'LONGBLOB';
    default:
      return this.key;
  }
};
BLOB.prototype.escape = false;
BLOB.prototype.stringify = function stringify(value) {
  if (!Buffer.isBuffer(value)) {
    if (Array.isArray(value)) {
      value = new Buffer(value);
    } else {
      value = new Buffer(value.toString());
    }
  }
  const hex = value.toString('hex');

  return this._hexify(hex);
};
BLOB.prototype._hexify = function _hexify(hex) {
  return "X'" + hex + "'";
};

/**
 * Range types are data types representing a range of values of some element type (called the range's subtype).
 * Only available in postgres.
 * See {@link http://www.postgresql.org/docs/9.4/static/rangetypes.html|Postgres documentation} for more details
 * @property RANGE
 */

function RANGE() {}
inherits(RANGE, ABSTRACT);

const pgRangeSubtypes = {
  integer: 'int4range',
  bigint: 'int8range',
  decimal: 'numrange',
  dateonly: 'daterange',
  date: 'tstzrange',
  datenotz: 'tsrange'
};

const pgRangeCastTypes = {
  integer: 'integer',
  bigint: 'bigint',
  decimal: 'numeric',
  dateonly: 'date',
  date: 'timestamptz',
  datenotz: 'timestamp'
};

RANGE.prototype.key = RANGE.key = 'RANGE';
RANGE.prototype.toSql = function toSql() {
  return pgRangeSubtypes[this._subtype.toLowerCase()];
};
RANGE.prototype.toCastType = function toCastType() {
  return pgRangeCastTypes[this._subtype.toLowerCase()];
};

function UUID() {}
inherits(UUID, ABSTRACT);
UUID.prototype.key = UUID.key = 'UUID';

function UUIDV1() {}
inherits(UUIDV1, ABSTRACT);
UUIDV1.prototype.key = UUIDV1.key = 'UUIDV1';

function UUIDV4() {}
inherits(UUIDV4, ABSTRACT);
UUIDV4.prototype.key = UUIDV4.key = 'UUIDV4';

function VIRTUAL(ReturnType, fields) {}
inherits(VIRTUAL, ABSTRACT);

VIRTUAL.prototype.key = VIRTUAL.key = 'VIRTUAL';

function ENUM() {}
inherits(ENUM, ABSTRACT);
ENUM.prototype.key = ENUM.key = 'ENUM';

function ARRAY(type) {}
inherits(ARRAY, ABSTRACT);

ARRAY.prototype.key = ARRAY.key = 'ARRAY';
ARRAY.prototype.toSql = function toSql() {
  return this.type.toSql() + '[]';
};
ARRAY.is = function is(obj, type) {
  return obj instanceof ARRAY && obj.type instanceof type;
};

function GEOMETRY() {}
inherits(GEOMETRY, ABSTRACT);
GEOMETRY.prototype.key = GEOMETRY.key = 'GEOMETRY';
GEOMETRY.prototype.escape = false;
GEOMETRY.prototype.stringify = function stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

function GEOGRAPHY() {}
inherits(GEOGRAPHY, ABSTRACT);
GEOGRAPHY.prototype.key = GEOGRAPHY.key = 'GEOGRAPHY';
GEOGRAPHY.prototype.escape = false;
GEOGRAPHY.prototype.stringify = function stringify(value, options) {
  return 'GeomFromText(' + options.escape(Wkt.convert(value)) + ')';
};

module.exports = {
  ABSTRACT,
  STRING,
  CHAR,
  TEXT,
  NUMBER,
  INTEGER,
  BIGINT,
  FLOAT,
  TIME,
  DATE,
  DATEONLY,
  BOOLEAN,
  NOW,
  BLOB,
  DECIMAL,
  NUMERIC: DECIMAL,
  UUID,
  UUIDV1,
  UUIDV4,
  HSTORE,
  JSON: JSONTYPE,
  JSONB,
  VIRTUAL,
  ARRAY,
  NONE: VIRTUAL,
  ENUM,
  RANGE,
  REAL,
  DOUBLE,
  'DOUBLE PRECISION': DOUBLE,
  GEOMETRY,
  GEOGRAPHY
};
