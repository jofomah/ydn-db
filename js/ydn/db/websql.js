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
 * @fileoverview Deferred wrapper for Web SQL storage.
 *
 * @see http://www.w3.org/TR/webdatabase/
 *
 * @author kyawtun@yathit.com (Kyaw Tun)
 */

goog.provide('ydn.db.WebSql');
goog.require('goog.async.Deferred');
goog.require('goog.debug.Logger');
goog.require('goog.events');
goog.require('ydn.async');
goog.require('ydn.db.Db');
goog.require('ydn.db.Query');
goog.require('ydn.json');


/**
 * Construct WebSql database.
 * Note: Version is ignored, since it does work well.
 * @implements {ydn.db.Db}
 * @param {string} dbname name of database.
 * @param {Array.<!ydn.db.DatabaseSchema>} schemas table schema contain table
 * name and keyPath.
 * @constructor
 */
ydn.db.WebSql = function(dbname, schemas) {
  var self = this;
  this.dbname = dbname;
  /**
   * @final
   * @protected
   * @type {Array.<!ydn.db.DatabaseSchema>}
   */
  this.schemas = schemas;

  this.schema = schemas[schemas.length - 1]; // we always use the last schema.

  var description = this.dbname;

  /**
   * Must open the database with empty version, otherwise unrecoverable error
   * will occur in the
   * first instance.
   * @protected
   * @type {Database}
   */
  this.db = goog.global.openDatabase(this.dbname, '', description,
    this.schema.size);

  if (this.db.version != this.schema.version) {
    this.migrate();
  }

};


/**
 *
 * @return {boolean} true if supported.
 */
ydn.db.WebSql.isSupported = function() {
  return goog.isFunction(goog.global.openDatabase);
};


/**
 *
 * @define {boolean} debug flag.
 */
ydn.db.WebSql.DEBUG = false;


/**
 * @protected
 * @final
 * @type {goog.debug.Logger} logger.
 */
ydn.db.WebSql.prototype.logger = goog.debug.Logger.getLogger('ydn.db.WebSql');


/**
 * Non-indexed field are store in this default field. There is always a column
 * in each table.
 * @const {string}
 */
ydn.db.WebSql.DEFAULT_FIELD = '_default_';


/**
 * Initialize variable to the schema and prepare SQL statement for creating
 * the table.
 * @protected
 * @param {ydn.db.StoreSchema} schema name of table in the schema.
 * @return {string} SQL statement for creating the table.
 */
ydn.db.WebSql.prototype.prepareCreateTable = function(schema) {

  var sql = 'CREATE TABLE IF NOT EXISTS ' + schema.getQuotedName() + ' (' +
    schema.getQuotedKeyPath() + ' TEXT UNIQUE PRIMARY KEY';

  var has_default = !!schema.getIndex(ydn.db.WebSql.DEFAULT_FIELD);
  if (!has_default) { // every table must has a default field.
    schema.addIndex(ydn.db.WebSql.DEFAULT_FIELD);
  }

  for (var i = 0; i < schema.indexes.length; i++) {
    /**
     * @type {ydn.db.IndexSchema}
     */
    var index = schema.indexes[i];
    var primary = index.unique ? ' UNIQUE ' : ' ';
    sql += ', ' + index.name + primary + index.type;
  }

  sql += ');';

  return sql;
};


/**
 * Migrate from current version to the last version.
 * @protected
 */
ydn.db.WebSql.prototype.migrate = function() {

  var me = this;

  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var success_callback = function(transaction, results) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log(results);
    }
    me.logger.finest('Creating tables OK.');
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    me.logger.warning('Error creating tables');
  };

  var sqls = [];
  for (var i = 0; i < this.schema.stores.length; i++) {
    sqls.push(this.prepareCreateTable(this.schema.stores[i]));
  }

  this.db.transaction(function(t) {
    me.logger.finest('Creating tables ' + sqls.join('\n'));
    t.executeSql(sqls.join('\n'), [], success_callback, error_callback);
  });

};


/**
 * @inheritDoc
 */
ydn.db.WebSql.prototype.put = function(store_name, obj) {
  var d = new goog.async.Deferred();

  var table = this.schema.getStore(store_name);
  if (!table) {
    this.logger.warning('Table ' + store_name + ' not found.');
    d.errback(undefined);
    return d;
  }

  var arr = goog.isArray(obj) ? obj : [obj];

  var me = this;

  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var success_callback = function(transaction, results) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log(results);
    }
    d.callback(true);
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    me.logger.warning('put error: ' + error);
    d.errback(undefined);
  };

  me.db.transaction(function(t) {
    for (var i = 0; i < arr.length; i++) {
      var last = i == arr.length - 1;

      var out = table.getIndexedValues(arr[i]);
      //console.log([obj, JSON.stringify(obj)]);

      var sql = 'INSERT OR REPLACE INTO ' + table.getQuotedName() +
        ' (' + out.columns.join(', ') + ') ' +
        'VALUES (' + out.slots.join(', ') + ');';

      //console.log([sql, out.values])
      // TODO: fix error check for all result
      t.executeSql(sql, out.values, last ? success_callback : undefined,
        last ? error_callback : undefined);
    }
  });
  return d;
};


/**
 * Parse resulting object of a row into original object as it 'put' into the
 * database.
 * @protected
 * @param {ydn.db.StoreSchema} table table of concern.
 * @param {!Object} row row.
 * @return {!Object} parse value.
 */
ydn.db.WebSql.prototype.parseRow = function(table, row) {
  goog.asserts.assertObject(row);
  var value = ydn.json.parse(row[ydn.db.WebSql.DEFAULT_FIELD]);
  var key = row[table.keyPath]; // NOT: table.getKey(row);
  goog.asserts.assertString(key);
  table.setKey(value, key);
  for (var j = 0; j < table.indexes.length; j++) {
    var index = table.indexes[j];
    if (index.name == ydn.db.WebSql.DEFAULT_FIELD) {
      continue;
    }
    var x = row[index.name];
    if (!goog.isDef(x)) {
      continue;
    }
    if (index.type == ydn.db.DataType.INTEGER) {
      x = parseInt(x, 10);
    } else if (index.type == ydn.db.DataType.FLOAT) {
      x = parseFloat(x);
    }
    value[index.name] = x;
  }
  return value;
};


/**
 * @inheritDoc
 */
ydn.db.WebSql.prototype.get = function(table_name, key) {
  var d = new goog.async.Deferred();

  var table = this.schema.getStore(table_name);
  if (!table) {
    this.logger.warning('Table ' + table_name + ' not found.');
    d.errback(undefined);
  }

  var me = this;

  if (goog.isDef(key)) {
    var sql = 'SELECT * FROM ' + table.getQuotedName() + ' WHERE ' +
        table.getQuotedKeyPath() + ' = ' + goog.string.quote(key) + ';';
  } else {
    var sql = 'SELECT * FROM ' + table.getQuotedName();
  }

  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var callback = function(transaction, results) {
    if (!goog.isDef(key)) {
      var arr = [];
      for (var i = 0; i < results.rows.length; i++) {
        var row = results.rows.item(i);
        arr.push(me.parseRow(table, row));
      }
      d.callback(arr);
    } else if (results.rows.length > 0) {
      var row = results.rows.item(0);
      d.callback(me.parseRow(table, row));
    } else {
      d.callback(undefined);
    }
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    me.logger.warning('get error: ' + error);
    d.errback(undefined);
  };

  this.db.transaction(function(t) {
    //console.log(sql);
    t.executeSql(sql, [], callback, error_callback);
  });

  return d;
};


/**
 * @inheritDoc
 */
ydn.db.WebSql.prototype.fetch = function(q) {
  var d = new goog.async.Deferred();
  var me = this;

  var store = this.schema.getStore(q.table);

  var column = q.field || store.keyPath;

  var op = q.op == ydn.db.Query.Op.START_WITH ? ' LIKE ' : ' = ';
  var sql = 'SELECT * FROM ' + store.getQuotedName() + ' WHERE ';
  if (q.op == ydn.db.Query.Op.START_WITH) {
    sql += '(' + column + ' LIKE ?)';
  } else {
    sql += '(' + goog.string.quote(column) + ' = ?)';
  }

  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var callback = function(transaction, results) {
    var values = [];
    for (var i = 0; i < results.rows.length; i++) {
      var row = results.rows.item(i);
      values.push(me.parseRow(store, row));
    }
    d.callback(values);
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    me.logger.warning('Sqlite error: ' + error);
    d.errback(undefined);
  };

  this.db.transaction(function(t) {
    var v = q.value + '%';
    //console.log(sql + ' | ' + v);
    t.executeSql(sql, [v], callback, error_callback);
  });

  return d;
};


/**
 * Deletes all objects from the store.
 * @param {string} opt_table_name table name.
 * @return {!goog.async.Deferred} return deferred function.
 * @private
 */
ydn.db.WebSql.prototype.clearTable_ = function(opt_table_name) {
  var d = new goog.async.Deferred();
  var self = this;

  var sql = '';
  if (goog.isDef(opt_table_name)) {
    var store = this.schema.getStore(opt_table_name);
    if (!store) {
      throw Error('Table ' + opt_table_name + ' not found.');
    }
    sql = 'DELETE FROM  ' + opt_table_name;
  } else {
    for (var i = 0; i < this.schema.stores.length; i++) {
      sql = 'DELETE FROM  ' + this.schema.stores[i].name + '; ';
    }
  }

  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var callback = function(transaction, results) {
    d.callback(true);
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    self.logger.warning('Sqlite error: ' + error);
    d.errback(undefined);
  };

  this.db.transaction(function(t) {
    t.executeSql(sql, [], callback, error_callback);
  });
  return d;
};



/**
 * @inheritDoc
 */
ydn.db.WebSql.prototype.count = function(table) {

  var d = new goog.async.Deferred();
  var me = this;

  table = table || ydn.db.Storage.DEFAULT_TEXT_STORE;
  var sql = 'SELECT COUNT(*) FROM ' + table;

  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var callback = function(transaction, results) {
    var row = results.rows.item(0);
    //console.log(['row ', row  , results]);
    d.callback(row['COUNT(*)']);
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    me.logger.warning('count error: ' + error);
    d.errback(undefined);
  };

  this.db.transaction(function(t) {
    t.executeSql(sql, [], callback, error_callback);
  });

  return d;
};




/**
 *
 * @param {string} table table name.
 * @param {string} id row name.
 * @return {!goog.async.Deferred} deferred result.
 * @private
 */
ydn.db.WebSql.prototype.deleteRow_ = function(table, id) {
  var d = new goog.async.Deferred();

  var store = this.schema.getStore(table);
  if (!store) {
    this.logger.warning('Table ' + table + ' not found.');
    d.errback(undefined);
    return d;
  }

  var me = this;

  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var success_callback = function(transaction, results) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log(results);
    }
    d.callback(true);
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    me.logger.warning('put error: ' + error);
    d.errback(undefined);
  };

  me.db.transaction(function(t) {
      var sql = 'DELETE FROM ' + store.getQuotedName() +
          ' WHERE ' + store.getQuotedKeyPath() + ' = ' + goog.string.quote(id);
      //console.log([sql, out.values])
      t.executeSql(sql, [], success_callback, error_callback);
  });
  return d;
};




/**
 * Remove all data in a store (table).
 * @param {string=} opt_table delete a specific table.
 * all tables.
 * @return {!goog.async.Deferred} return a deferred function.
 */
ydn.db.WebSql.prototype.clear = function(opt_table) {

  if (opt_table) {
    return this.clearTable_(opt_table);
  } else {
    var dfs = [];
    for (var store in this.schema) {
      dfs.push(this.clearTable_(store));
    }
    return ydn.async.reduceAllTrue(new goog.async.DeferredList(dfs));
  }
};


/**
 * @inheritDoc
 */
ydn.db.WebSql.prototype.remove = function(opt_table, opt_id) {
  
  if (goog.isDef(opt_table)) {
    if (goog.isDef(opt_id)) {
      return this.deleteRow_(opt_table, opt_id);
    } else {
      return this.dropTable_(opt_table);
    }
  } else {
    return this.dropTable_();
  }
};

/**
 * @param {string=} opt_table table name to be deleted, if not specified all
 * tables will be deleted.
 * @return {!goog.async.Deferred} deferred result.
 * @private
 */
ydn.db.WebSql.prototype.dropTable_ = function(opt_table) {

  var d = new goog.async.Deferred();
  var me = this;

  var sql = '';
  if (goog.isDef(opt_table)) {
    var store = this.schema.getStore(opt_table);
    if (!store) {
      throw Error('Table ' + opt_table + ' not found.');
    }
    sql = sql + 'DROP TABLE ' + store.getQuotedName() + ';';
  } else {
    for (var i = 0; i < me.schema.stores.length; i++) {
      sql = sql + 'DROP TABLE ' + me.schema.stores[i].getQuotedName() + ';';
    }
  }


  /**
   * @param {SQLTransaction} transaction transaction.
   * @param {SQLResultSet} results results.
   */
  var callback = function(transaction, results) {
    //console.log(['row ', row  , results]);
    d.callback(true);
    me.logger.warning('Deleted database: ' + me.dbname);
  };

  /**
   * @param {SQLTransaction} tr transaction.
   * @param {SQLError} error error.
   */
  var error_callback = function(tr, error) {
    if (ydn.db.WebSql.DEBUG) {
      window.console.log([tr, error]);
    }
    me.logger.warning('Delete TABLE: ' + error);
    d.errback(undefined);
  };

  this.db.transaction(function(t) {
    //console.log(sql);
    t.executeSql(sql, [], callback, error_callback);
  });

  return d;
};

