/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var
config      = require('../../lib/configuration'),
uuid        = require('node-uuid'),
redis       = require('../../lib/redis')(),
BotUtils    = require('./bot-utils'),
botDB       = require('./bot-mysql'),
logger      = require('../../lib/logger');

module.exports = function(bot){
  var self = this;

  this.bot = bot;

  this.error = function(error){
    if (typeof(error) != 'string'){
      error = JSON.stringify(error)
    }
    logger.error(error);
  };

  this.connectionClosed = function(){
    if (bot.state == 'disconnecting'){
      bot.state = 'disconnected';
    }
    else{
      logger.info("IRC Bot Got close event.");
      bot.reconnect();
    }
  };

  
  this.botJoinedMotown = function(channel, who){
    bot.state = "joined";


    // Get all the users in #motown
    bot.client.once("names", function(channel, nicksAsKeys){

      // Reset who we're tracking
      bot.nicksByBaseNick = {}; // {'wex': 'wex|afk', ...}
      bot.aliases = {}; // {'wex|afk': 'wex'}

      // Normalize the nicks (ignore owner) and ignore ourselves motown
      var nicks = [];
      for (nick in nicksAsKeys){
        nick = BotUtils.normalizeIrcName(nick);
        
        if (nick != self.bot.nick){
          nicks.push(nick);
        }
      }

      if (nicks.length == 0){
        bot.emit('operational')
      }
      else{
        for (var i in nicks){

          var nick = nicks[i];
          bot.nicksByBaseNick[BotUtils.parseNick(nick).nick] = nick;
          
          // Emit the operational event for the last nick lookup.
          if (i < (nicks.length - 1)){
            bot.updateUser(nick);
          }
          else{
            bot.updateUser(nick, function(){
              bot.emit("operational");
            });
          }
        }
      }

    });
    redis.publish('contacts.reset', JSON.stringify({topic: 'contacts.botReset'}), function(err){
      botDB.clearNetworks(function(){
        self.bot.client.send('NAMES', '#motown');
      });
    });
  };

  this.botRegistered = function(){
    bot.state = "registered";

    // We're registered, now we wait until the bot has joined #motown
    bot.client.once('join', self.botJoinedMotown);
  };

  //This is emitted in response to the names command in registered.
  this.whoisData = function(response, callback){
    if (response.error){
      if (response.error == 'No such nick/channel'){
        // Clean up refs to that nick
        delete self.bot.aliases[response.nick];
        delete self.bot.nicksByBaseNick[BotUtils.parseNick(response.nick).nick];
      }
      logger.error("Error performing WHOIS lookup:\n\t" + response.error + "(" + response.nick + ")");
    }
    else {
      var botUpdateId = uuid.v1();
      var user = BotUtils.parseNick(response.nick);

      self.bot.aliases[response.nick] = user.nick;
      self.bot.nicksByBaseNick[user.nick] = response.nick;

      var networks = BotUtils.normalizeChannels(response.channels);

      botDB.insertNetworkUpdate(networks, user.nick, user.status, botUpdateId, function(data){
        if (typeof(callback) == 'function'){
          callback();
        }

        if (data){
          var message = {
            topic: 'contacts.userStatusUpdate',
            'data': data
          };

          redis.publish('contacts.userStatusUpdate', JSON.stringify(message), function(err){
            if (err)
              logger.error(err);
          });
        }
      });
    } 
  };  

  this.userJoinedMotownChannel = function(channel, who) {
    if (who != self.bot.nick){
      self.bot.updateUser(who);
    }
  };

  this.userDisconnected = function(who, message, channels, d, e){
    self.userLeft(null, who);
  };

  this.userLeft = function(channel, who, callback, c, d, e){

    // A bit of argument swapping madness
    if (typeof(callback) != 'function'){
      if (typeof(who) == 'function'){
        callback = who;
        who = undefined;
      }
      
      if (typeof(who) == 'undefined' || who == null){
        who = channel;
        channel = undefined;
      }
    }
    
    var user = BotUtils.parseNick(who);
    
    delete self.bot.nicksByBaseNick[user.nick];
    delete self.bot.aliases[who];

    botDB.markUserAsOffline(user.nick, function(id){
      if (id){
        var message = {
          topic: 'contacts.userOffline',
          data: {
            id: id,
            nick: user.nick
          }
        }

        redis.publish('contacts.userOffline', JSON.stringify(message), function(err){
          if(err)
            logger.error(err);

          if (typeof(callback) == 'function'){
            callback();
          }
        });
      }
    });
  };

  this.userNickChanged = function(oldNick, newNick, channels){
    logger.verbose("Nick changed. " + oldNick + " => " + newNick);
    if (oldNick && newNick != self.bot.nick){

      // We treat this as if the user leaves and returns, remembering 
      // that old status is removed when a network update is issued.
      var oldUser = BotUtils.parseNick(oldNick);
      var newUser = BotUtils.parseNick(newNick);

      // If the user is either going to be, or currently isn't recognizable, 
      // we issue a user left first to make sure we clean up.
      if (oldUser.nick != newUser.nick){
        self.userLeft(oldNick);
      }
      else{
        delete self.bot.aliases[oldNick];
        delete self.bot.nicksByBaseNick[oldUser.nick];
      }
      
      self.whoisData({'nick': newNick, 'channels': channels});
    }
  };
};
