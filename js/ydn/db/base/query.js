// Copyright 2012 YDN Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


/**
 * @fileoverview Query to represent stream of cursor.
 *
 * Cursors are a transient mechanism used to iterate on stream of ordered
 * records from a store. Cursor object define exact stream of records and
 * conditioned iteration process and retain state of cursor position.
 */


goog.provide('ydn.db.Query');
goog.provide('ydn.db.Query.Direction');
goog.require('goog.functions');
goog.require('ydn.db.KeyRange');
goog.require('ydn.db.Where');
goog.require('ydn.error.ArgumentException');



/**
 * Create a query object.
 * @param {string} store store name.
 * @param {ydn.db.Query.Direction=} direction cursor direction.
 * @param {string=} index store field, where key query is preformed. If not
 * provided, the first index will be used.
 * @param {(!KeyRangeJson|ydn.db.KeyRange|!ydn.db.IDBKeyRange|string|number)=}
  * keyRange configuration in json or native format. Alternatively key range
 * constructor parameters can be given.
 * @param {...} opt_args additional parameters for key range constructor.
 * @constructor
 */
ydn.db.Query = function(store, direction, index, keyRange, opt_args) {
  // Note for V8 optimization, declare all properties in constructor.
  if (!goog.isString(store)) {
    throw new ydn.error.ArgumentException('store name required');
  }
  if (goog.isDef(index) && !goog.isString(index)) {
    throw new ydn.error.ArgumentException('index');
  }
  /**
   * Store name.
   * @final
   * @type {string}
   */
  this.store_name = store;
  /**
   * Indexed field.
   * @final
   * @type {string|undefined}
   */
  this.index = index;

  if (!goog.isDefAndNotNull(direction)) {
    direction = undefined;
  } else if (['next', 'prev'].indexOf(direction) == -1) {
    throw new ydn.error.ArgumentException('direction');
  }
  /**
   * @final
   * @type {ydn.db.Query.Direction|undefined}
   */
  this.direction = direction;

  var kr;
  if (keyRange instanceof ydn.db.KeyRange) {
    kr = ydn.db.KeyRange.parseKeyRange(keyRange);
  } else if (goog.isObject(keyRange)) {
    // must be JSON object
    kr = ydn.db.KeyRange.parseKeyRange(keyRange);
  } else if (goog.isDef(keyRange)) {
    kr = ydn.db.IDBKeyRange.bound.apply(this,
      Array.prototype.slice.call(arguments, 3));
  }
  /**
   * @final
   * @type {!ydn.db.IDBKeyRange|undefined}
   */
  this.keyRange = kr;

  // set all null so that no surprise from inherit prototype

  this.filter = null;
  this.continued = null;

  // transient properties during cursor iteration
  this.counter = 0;
  this.store_key = undefined;
  this.index_key = undefined;
  this.has_done = undefined;

};


/**
 * Cursor direction.
 * @link http://www.w3.org/TR/IndexedDB/#dfn-direction
 * @enum {string} Cursor direction.
 */
ydn.db.Query.Direction = {
  NEXT: 'next',
  NEXT_UNIQUE: 'nextunique',
  PREV: 'prev',
  PREV_UNIQUE: 'prevunique'
};



/**
 * @const
 * @type {!Array.<ydn.db.Query.Direction>} Cursor directions.
 */
ydn.db.Query.DIRECTIONS = [
  ydn.db.Query.Direction.NEXT,
  ydn.db.Query.Direction.NEXT_UNIQUE,
  ydn.db.Query.Direction.PREV,
  ydn.db.Query.Direction.PREV_UNIQUE
];

/**
 *
 * @return {string} return store name.
 */
ydn.db.Query.prototype.getStoreName = function() {
  return this.store_name;
};


/**
 * @inheritDoc
 */
ydn.db.Query.prototype.toJSON = function() {
  return {
    'store': this.store_name,
    'index': this.index,
    'key_range': this.keyRange ? ydn.db.KeyRange.toJSON(this.keyRange) : null,
    'direction': this.direction
  };
};

/**
 * Right value for query operation.
 * @type {ydn.db.IDBKeyRange|undefined}
 */
ydn.db.Query.prototype.keyRange;

/**
 * Cursor direction.
 * @type {(ydn.db.Query.Direction|undefined)}
 */
ydn.db.Query.prototype.direction;

/**
 * @type {?function(*): boolean}
 */
ydn.db.Query.prototype.filter = null;

/**
 * @type {?function(*): boolean}
 */
ydn.db.Query.prototype.continued = null;





/**
 * @override
 */
ydn.db.Query.prototype.toString = function() {
  var idx = goog.isDef(this.index) ? ':' + this.index : '';
  return 'Cursor:' + this.store_name + idx;
};



//
///**
// * @final
// * @param {string} op
// * @param {number|string} lv
// * @param {number|string} x
// * @return {boolean}
// */
//ydn.db.Query.op_test = function(op, lv, x) {
//  if (op === '=' || op === '==') {
//    return  x == lv;
//  } else if (op === '===') {
//    return  x === lv;
//  } else if (op === '>') {
//    return  x > lv;
//  } else if (op === '>=') {
//    return  x >= lv;
//  } else if (op === '<') {
//    return  x < lv;
//  } else if (op === '<=') {
//    return  x <= lv;
//  } else if (op === '!=') {
//    return  x != lv;
//  } else {
//    throw new Error('Invalid op: ' + op);
//  }
//};



/**
 *
 * @return {*|undefined} Current cursor key.
 */
ydn.db.Query.prototype.key = function() {
  return this.store_key;
};


/**
 *
 * @return {*|undefined} Current cursor index key.
 */
ydn.db.Query.prototype.indexKey = function() {
  return this.index_key;
};



/**
 *
 * @return {number} number of record iterated.
 */
ydn.db.Query.prototype.count = function() {
  return this.counter;
};


/**
 *
 * @return {boolean|undefined} number of record iterated.
 */
ydn.db.Query.prototype.done = function() {
  return this.has_done;
};


/**
 *
 * @return {!Array.<string>}
 */
ydn.db.Query.prototype.stores = function() {
  return [this.store_name];
};

