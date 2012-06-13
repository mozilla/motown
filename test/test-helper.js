/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Force environment. -- We do some destructive things to the database. 
process.env.NODE_ENV = 'test';

var 
config = require('../lib/configuration'),
mysql  = require('mysql').createClient(config.get('mysql')),
path   = require('path'),
logger = require('../lib/logger'),
s      = require('string'),
fs     = require('fs');

// Add the directory that corresponds to the test folder into require
// This lets irc tests do things like:
// require('bot');

// var testDir = path.dirname(module.filename);
// var feature = path.dirname(module.parent.filename);

// feature = feature.slice(testDir.length);
// featureDir = path.join(testDir, '..', 'app', feature);

// //TODO: Probably a bad practice :P
// require.main.paths.unshift(featureDir);

function chainStatements(statements, cb){

  var sql = statements.shift();

  if (sql && !s(sql).isEmpty()){
    mysql.query(sql, function(err, result){
      if (err){
        throw new Error("Error inserting fixtures. \n\t" + err);
      }
      chainStatements(statements, cb);
    });
  }
  else if (typeof(cb) == 'function'){
    cb();
  }
}

module.exports = {
  fixtures: {
    mysql: {
      load: function(type, set, deleteFirst, cb){
        if (typeof(deleteFirst) == 'function'){
          cb = deleteFirst;
          deleteFirst = true;
        }
        else if(typeof(deleteFirst) == 'undefined'){
          deleteFirst = true;
        }


        var statements = fs.readFileSync(path.join(process.env.APP_ROOT, 'test', 'fixtures', type, set + '.sql'), 'utf8').split("\;\n");


        if (deleteFirst){
          mysql.query("DELETE FROM users", function(err, result){
            chainStatements(statements, cb);
          });
        }
        else{
          chainStatements(statements, cb);
        }
      }
    }
  }
};
