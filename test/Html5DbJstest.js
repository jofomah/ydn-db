/**
 * @fileoverview JsTestDriver test unit for ydn.store.Storage.
 */

goog.provide('ydn.store.Html5DbJstest');
goog.require('goog.debug.Console');
goog.require('goog.debug.LogManager');
goog.require('ydn.db.Html5Db');
goog.require('ydn.db.test');


ydn.store.Html5DbJstest = AsyncTestCase('Html5DbJstest');

ydn.store.Html5DbJstest.prototype.setUp = function() {
  //console.log('running test for IndexedDbJstest');

  var c = new goog.debug.Console();
  c.setCapturing(true);
  goog.debug.LogManager.getRoot().setLevel(goog.debug.Logger.Level.FINE);
  goog.debug.Logger.getLogger('ydn.db.Html5Db').setLevel(goog.debug.Logger.Level.FINEST);

  this.dbname = 'test_2';

};


ydn.store.Html5DbJstest.prototype.test_special_key = function(queue) {
  var db = new ydn.db.Html5Db(this.dbname, [ydn.db.test.getSchema()]);
  ydn.db.test.special_keys_test(queue, db);
};


ydn.store.Html5DbJstest.prototype.test_put_get_object = function(queue) {
  var db = new ydn.db.Html5Db(this.dbname, [ydn.db.test.getSchema()]);
  ydn.db.test.run_put_get_tests(queue, db);
};
