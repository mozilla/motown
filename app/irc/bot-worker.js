/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var
config      = require('../../lib/configuration'),
mysql       = require('mysql').createClient(config.get('mysql')),
BotUtils    = require('./bot-utils'),
Redis       = require('../../lib/redis'),
logger      = require('../../lib/logger');

function Worker(bot){
  this.bot = bot;
  this.workerRedis = new Redis();
  this.redis = new Redis();
  var self = this;
  this.bot.once('operational', function(){self.beAGoodLittleWorker()});
}

Worker.prototype.beAGoodLittleWorker = function(){

  var self = this;
  self.workerRedis.brpop('irc:whois', 'irc:user-connected', 0, function(err, data){

    var args = JSON.parse(data.pop());
    var cmd = data.pop().split(':')[1];

    logger.verbose("IRC Daemon servicing " + cmd + " request.");


    // We swap the responseQueue with a callback function.
    var responseQueue = args.pop();

    args.push(function(resp){
      self.redis.lpush(responseQueue, JSON.stringify(resp));
    });

    switch(cmd){
      case 'whois':
        if (typeof(args[0]) == 'string' && args[0].length > 0){
          self.bot.client.whois.apply(self.bot.client, args);
        }
        else{
          //callback
          args.pop()({nick: null, error: "Null or empty nick supplied."});
        }
        
        break;

      case 'user-connected': //(id, nick, responseQueue/)
        var id = args[0];
        var nick = args[1];
        var cb = args[2];
        if (nick){
          self.bot.updateUser(nick, function(response){
            if (!~response.channels.indexOf('#motown')){
              self.bot.client.send('INVITE', response.nick, '#motown');
            }

            if (typeof(cb) == 'function'){
              var user = BotUtils.parseNick(response.nick);
              cb({error: null, 'nick': user.nick, 'status': user.status, 'channels': response.channels});
            }
          });
        }
        else{
          cb({error: "nick  not provided"});
        }
        break;
    }
    process.nextTick(function(){self.beAGoodLittleWorker()});
  });
};

module.exports = Worker;