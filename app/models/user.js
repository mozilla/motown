#!/usr/local/bin/node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */



// Module dependencies.
const 
config = require('../../lib/configuration'),
logger = require('../../lib/logger'),
crypto = require('crypto'),
mysql  = require('mysql').createClient(config.get('mysql'));

require('../../lib/extensions/string');

//TODO: Add lock_version for optimistic locking.

function User(attrs){
  this.email = (attrs['email'] || '').trim();
  this.realName = (attrs['realName'] || attrs['real_name'] || '').trim();
  this.nick = (attrs['nick'] || '').trim();
  this.gravatarHash = crypto.createHash('md5').update(this.email).digest("hex");
}

module.exports = User;

User.prototype.getDisplayName = function(){
  if (this.realName){
    return this.realName;
  }
  
  if (this.nick){
    return this.nick;
  }

  return this.email;
};

User.prototype.getGravatarUrl = function(size){
  if (!size){
    size = 30;
  }
  var hash = crypto.createHash('md5').update(this.email).digest("hex");
  return "http://www.gravatar.com/avatar/" + hash + "?s=" + size;
};

User.prototype.save = function(callback){
  if (this['id']){
    mysql.query(
      "UPDATE users SET email = ?, real_name = ?, nick = ?, updated_at = NOW() WHERE id = ?",
      [this.email, this.realName, this.nick, this.id],
      function(err, results, fields){
        if (typeof(callback) == 'function')
          callback(err, err ? 'OK' : null);
      }
    );
  }
  else{
    var self = this;
    mysql.query(
      "INSERT INTO users (email, real_name, nick, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
      [this.email, this.realName, this.nick],
      function(err, results, fields){
        if (err){
          //TODO: Nicer error handling
          logger.error(err);
          if (typeof(callback) == 'function')
            callback(err, message);
        }
        else{
          self.id = results.insertId
          if (typeof(callback) == 'function')
            callback(null, self);
        }
      }
    );
  }
};

User.finderCallback = function(err, rows, callback){
  if (err){
    logger.error(JSON.stringify(err));
  }
  else{
    if (rows.length > 0){
      var data = rows[0];
      var user = new User(data);
      user.id         = data['id'];
      user.email      = data['email']
      user.realName   = data['real_name'];
      user.nick       = data['nick'];
      user.createdAt  = data['created_at'];
      user.updatedAt  = data['updated_at'];
      callback(null, user);
    }
    else{
      callback(null, null);
    }
  }
};

User.find = function(id, callback){
  mysql.query(
    "SELECT id, email, real_name, nick, created_at, updated_at FROM users where id = ? LIMIT 1", 
    [id], 
    function(err, rows){User.finderCallback(err, rows, callback);}
  );
};

User.findByEmail = function(email, callback){
  mysql.query(
    "SELECT id, email, real_name, nick, created_at, updated_at FROM users where email = ? LIMIT 1", 
    [email], 
    function(err, rows){User.finderCallback(err, rows, callback);}
  );
};
