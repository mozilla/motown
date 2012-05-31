#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
 
const
Url = require('url');

var
config      = require('../../lib/configuration'),
logger      = require('../../lib/logger'),
irc         = require('irc'),
uuid        = require('node-uuid'),
mysql       = require('mysql').createClient(config.get('mysql')),
redis       = require('../../lib/redis')(),
workerRedis = require('../../lib/redis')();

require('../../lib/extensions/number');

var idsByNick = {}; // {<user.nick>: <user.id>, ...}
var aliases = {}; // {user.nick: "<nick|withstatus>", ...}
var channels = {}; // {'#channel': [<user.id>, ...], ...}

/*
 * Here's what we do on startup:
 *  - Connect to IRC server
 *  - Wait for registration
 *  - /join #motown
 *  - Get all the nicks we care about from our user table
 *  - For each User:
 *    - WHOIS user.nick
 *      - For each channel
 *        - REPLACE INTO networks
 *  - DELETE from networks where bot_instance_id <> <BOT_INSTANCE_ID>
 *    (This makes sure that old cached info is destroyed after a restart)
 *
 */

logger.info("IRC Bot Starting up.");

var ircConfig = config.get('irc');
var bot = new irc.Client(ircConfig.server, ircConfig.nick, {
  debug: true,
  realName: 'Non-archiving MoTown bot',
  channels: ['#motown']
});

bot.addListener('error', function(error){
  console.log(error);
});

bot.addListener('close', function(){
  console.log("IRC Got close event.");
  process.exit(1);
});

bot.addListener("registered", function(){
  mysql.query(
    "SELECT id, nick FROM users WHERE nick is not null and nick <> ''",
    function(err, rows){
      if (!err){
        for(var i in rows){
          var row = rows[i];

          idsByNick[row.nick] = row.id;
          console.log("updating user " + row.nick);
          updateUserStatus(row.nick);          
        }
      }
      else{
        logger.error("Error retrieving nicks from users table.");
        logger.error(err);
        process.exit(1);
      }
    }
  );
});

bot.addListener('join', function(channel, who) {
  var parts = parseStatus(who);
  var nick = parts[0];
  var status = parts[1];

  if (status){
    aliases[nick] = who;
  }


  if (nick in idsByNick){
    // User has just joined another channel
    insertNetworkUpdate(channel, idsByNick[nick], status, null, function(){
      broadcast();
    });
  }
  else{
    mysql.query("SELECT id FROM users where nick = ?", [nick], function(err, rows){
      if (rows.legnth > 0){
        idsByNick[nick] = rows[0].id;
        insertNetworkUpdate(channel, rows[0].id, status, null, function(){
          broadcast();
        });

        // This is to help with bootstrapping:
        updateUserStatus(nick);
      }
      // Otherwise we don't care, it's not someone who's part of motown.
    });
  }

  console.log('%s has joined %s', who, channel);
});


// This is a hackity hack way of doing this
// Essentially, we tell the socket to update all 
// the users that have anything to do with this user.
// Those connections should really just listen in on
// events for each channel/network
function getBroadcastList(userId, callback){
  mysql.query(
    "SELECT DISTINCT \
      users.id as userId \
    FROM \
      users \
    INNER JOIN \
      networks \
      ON networks.user_id = users.id \
    WHERE \
      networks.channel in \
      ( \
        SELECT channel \
        FROM networks as n2 \
        WHERE n2.user_id = ? and networks.user_id <> ? \
      )",
    [userId, userId],
    function(err, rows){
      if (err){
        logger.error("Error in getBroadcastList: " + err);
      }
      else {
        var ids = [];
        for (var i in rows){
          ids.push(rows.userId);
        }
        callback(ids);
      }
    }
  );
}

function broadcast(){
  redis.publish('contacts.update', null, function(err){
    if (err)
        logger.error(err);
  });
}

function userLeftChannel(channel, who){
  logger.debug("User " + who + " left " + channel);
  var nick = parseStatus(who)[0];

  // We only care if they're in motown
  if (nick in idsByNick){
    mysql.query(
      "DELETE FROM networks WHERE user_id = ? and channel = ?",
      [idsByNick[nick], channel],
      function(err, rows){
        broadcast();
        mysql.query(
          "SELECT COUNT(*) as count FROM users where id = ?",
          [idsByNick[nick]],
          function(err, rows){
            if (err)
              logger.debug(err)
            else{
              if (rows[0].count == 0){
                delete idsByNick[nick];
                delete aliases[nick];
              }
            }
          }
        );
      }
    );
  }
}


function userLeft(who){
  var nick = parseStatus(who)[0];
  if (nick in idsByNick){
    mysql.query(
      "DELETE FROM networks WHERE user_id = ?",
      [idsByNick[nick]],
      function(){
        broadcast();
        delete idsByNick[nick];
        delete aliases[nick];
      }
    );
  }
}
bot.addListener('part', userLeftChannel);
bot.addListener('kick', userLeftChannel);
bot.addListener('kill', userLeft);
bot.addListener('quit', userLeft);
bot.addListener('nick', function(oldNick, newNick, channels) {
  // First check to see if we care about either the old, or new nicks
  var parts = parseStatus(oldNick);
  oldNick = parts[0];
  var oldStatus = parts[1];

  parts = parseStatus(newNick);
  newNick = parts[0];
  var newStatus = parts[1];

  // This means we care.
  if (oldNick in idsByNick){
    if (!newNick in idsByNick){
      // This is the same as the user leaving
      userLeft(oldNick);
      return;
    }
    else{
      // This is just a status update
      if (oldNick in aliases){
        // From a previous non-null status
        delete aliases[oldNick];
      }

      if (newStatus){
        // To a non-null statu
        aliases[newNick] = newNick + "|" + newStatus;
      }

      if (newNick != oldNick){
        logger.error("olcNick should equal newNick, but doesn't: " + JSON.stringify({'oldNick': oldNick, 'newNick': newNick}));
      }


      mysql.query(
        "UPDATE networks SET status = ? WHERE user_id = ?",
        [newStatus, idsByNick[newNick]],
        function(err, results){
          if (err)
            logger.error(err);
          broadcast();
        }
      );
    }
  }
  else{
    // This means the user might have changed from something we didn't track to something we do.
    mysql.query(
      "SELECT id FROM users WHERE nick = ?",
      [newNick],
      function(err, rows){
        if (rows.length > 0){
          if (newStatus){
            aliases[newNick] = newNick + "|" + newStatus;
          }
          var userId = rows[0].id;
          idsByNick[newNick] = userId;

          insertNetworkUpdate(channels, userId, newStatus, function(){
            broadcast();
          });
        }
      }
    );
  }
});
  

/*
 *  Returns the nick with status if appropriate
 * 
 */
function activeNick(nick){
  if (nick in aliases)
    return aliases[nick];
  return nick;
}

function parseStatus(nick){
  return nick.split("|", 2);
}

function insertNetworkUpdate(channels, userId, status, botUpdateId, callback){
  if (typeof(channels) == 'string'){
    channels = [channels];
  }
  var placeholders = [];
  var values = [];

  for (var i in channels){
    placeholders.push("(?, ?, ?, ?)");
    values.push(channels[i]);
    values.push(userId);
    values.push(status);
    values.push(botUpdateId);
  }

  if (channels.length > 0){
    mysql.query(
      "REPLACE INTO networks (channel, user_id, status, bot_update_id) VALUES " + placeholders.join(', '),
      values,
      function(err){
        if (err)
          logger.error(err);

        if (typeof(callback) == 'function'){
          callback();
        }
      }
    );
  }
  else{
    console.log("User: " + userId + " wasn't in any chans");
  }
}

function updateUserStatus(nick, cb){
  console.log("Updating user status, active nick: " + activeNick(nick) + ". (nick: " + nick + ")");
  bot.whois(activeNick(nick), function(response){
    if (!response.error){

      var status = parseStatus(activeNick(nick))[1];
      var botUpdateId = uuid.v1();

      insertNetworkUpdate(response.channels, idsByNick[nick], status, botUpdateId, function(){
        mysql.query("DELETE FROM networks WHERE user_id = ? AND bot_update_id <> ?", [idsByNick[nick], botUpdateId], function(err){
          if (typeof(cb) == 'function'){
            cb(nick, status, response.channels);
          }
        });
      });
    }
  });
}

function beAGoodLittleWorker(){
  workerRedis.brpop('irc:whois', 'irc:user-connected', 0, function(err, data){

    var args = JSON.parse(data.pop());
    var cmd = data.pop().split(':')[1];

    logger.debug("IRC Daemon servicing " + cmd + " request.");


    // We swap the responseQueue with a callback function.
    var responseQueue = args.pop();

    args.push(function(resp){
      redis.lpush(responseQueue, JSON.stringify(resp));
    });

    switch(cmd){
      case 'whois':
        if (typeof(args[0]) == 'string' && args[0].length > 0){
          bot.whois.apply(bot, args);
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
          updateUserStatus(nick, function(nick, status, channels){
            if (!~channels.indexOf('#motown')){
              bot.send('INVITE', activeNick(nick), '#motown');
            }

            if (typeof(cb) == 'function'){
              cb({error: null, 'nick':nick, 'status': status, 'channels': channels});
            }
          });
        }
        else{
          cb({error: "nick  not provided"});
        }
        break;
    }
    process.nextTick(beAGoodLittleWorker);
  });
}

beAGoodLittleWorker();
