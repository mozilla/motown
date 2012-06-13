#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */



var
helper      = require('../test-helper'),
config      = require('../../lib/configuration'),
mysql       = require('mysql').createClient(config.get('mysql')),
redis       = require('../../lib/redis')(),
pubsubRedis = require('../../lib/redis')(),
uuid        = require('node-uuid'),
Bot         = require('../../app/irc/bot'),
should      = require('should'),

IrcClient = require('irc').Client,
// ircServer = require('./server');

describe('IRC Bot', function(){
  var bot = new Bot();
  var ircConfig = config.get('irc');

  beforeEach(function(done){
    helper.fixtures.mysql.load('users', 'base', done);
  });

  afterEach(function(done){
    bot.disconnect(function(){
      // ircServer.close(done);
      
    });
  });

  describe('#connect()', function(){
    it("should connect to the IRC server and join #motown", function(done){
      ircServer.start(function(){
        bot.connect(function(err, state){

          state.should.equal('operational');

          
          ircServer.users.registered[0].nick.should.equal('motown');
          
          // TODO: Check we're in #motown.

          done();
        });
      });
    });
  });

  describe('#connect()', function(){
    it("should find current online users", function(done){
      ircServer.start(function(){
        var shane = new IrcClient('localhost', 'shane',     {userName: 'nodebot1', channels: ['#motown']});
        var david = new IrcClient('localhost', 'david|afk', {userName: 'nodebot2', channels: ['#motown'], autoConnect: false});
        var mark  = new IrcClient('localhost', 'hiding',    {userName: 'nodebot3', channels: ['#motown'], autoConnect: false});

        shane.once("registered", function(){
          mark.connect();
        });

        mark.once("registered", function(){
          david.connect();
        });
        
        david.once("registered", function(){
          bot.connect(function(err, state){
            mysql.query('select * from networks inner join users on users.id = networks.user_id order by users.nick', function(err, result){
              // We rely on the alpha order of nicks
              result.should.have.lengthOf(2);
              
              console.log("\n\n\tHERE WE BE!\n\n")

              // David
              result[0].status.should.be.equal('afk');

              // Shane's status should be null
              should.not.exist(result[1].status);

              // This looks a bit disjointed, but we make 3 changes and expect messages through redis for each
              // Then we take the users offline.

              var statusChecklist = {
                'david': null,
                'mark': null,
                'shane': 'away'
              };

              // We only care about the ids
              var disconnectChecklist = {
                'david': null,
                'mark': null,
                'shane': null
              }

              pubsubRedis.on("ready", function(){
                pubsubRedis.subscribe(["contacts.userStatusUpdate", "contacts.userOffline"]);
              });

              // Annoying how javascript doesn't have hashes.
              Object.size = function(obj) {
                var size = 0, key;
                for (key in obj) {
                  if (obj.hasOwnProperty(key)) size++;
                }
                return size;
              };

              pubsubRedis.on("message", function(channel, message){
                console.log(message);
                var message = JSON.parse(message);
                switch(channel){
                  case "contacts.userStatusUpdate":
                    // A user status update looks like this:
                    // {
                    //   topic: 'userStatusUpdate',
                    //   data: {
                    //     'nick': <base nick>,
                    //     'status': <status>,
                    //     'networks': [<channels>]
                    //   }
                    // }
                    message.topic.should.equal('userStatusUpdate');
                    var expectedStatus = statusChecklist[message.data.nick];

                    message.data.status.should.equal(expectedStatus);

                    // Mark it off the checklist
                    delete statusChecklist[message.data.nick];
                  case "contacts.userOffline":
                    //{
                    //  topic: 'userOffline',
                    //  data: {
                    //    nick: <baseNick>
                    //  }
                    //}
                    message.topic.should.equal('userOffline');
                    
                    disconnectChecklist[message.data.nick].should.equal(null);

                    delete disconnectChecklist[message.data.nick];
                  default:
                    throw("Error! Unexpected message");
                    done();
                }
                if (statusChecklist.size == 0){
                  david.disconnect();
                  shane.disconnect();
                  mark.disconnect();
                }
                if (disconnectChecklist.size == 0){
                  done();
                }
              });

              // David goes 'online' from 'afk'
              david.send("NICK", 'david');

              // Mark goes 'online' from <nonexistant>
              mark.send("NICK", 'mark');

              // // Shane goes "away" from online
              shane.send("NICK", 'shane|afk');

            });
          });
        });

      });
    });
  });

  describe('#connect()', function(){
    it("should connect to the IRC server eventually...", function(done){
      bot.connect(function(err, state){
        state.should.equal('operational');
        ircServer.users.registered.length.should.equal(1);
        ircServer.users.registered[0].nick.should.equal('motown');
        
        done();
      });

      // We start the IRC server after a little bit.
      setTimeout(function(){ircServer.start()}, 100);
    });
  });

  describe('worker', function(){
    it("should answer requests from redis", function(done){
      ircServer.start(function(){
        var shane = new IrcClient('localhost', 'shane',     {channels: ['#motown'], realName: 'Shane Caraveo'});
        shane.addListener('registered', function(){
          bot.connect(function(err, state){
            var responseQueue = "irc-resp:" + uuid.v1();
            redis.lpush("irc:whois", JSON.stringify(['shane', responseQueue]));
            redis.brpop(responseQueue, 10, function(err, data){
              var whois = JSON.parse(data[1]);
              whois.nick.should.equal('shane');
              whois.realname.should.equal('Shane Caraveo');
              shane.disconnect();
              done();
            });
          });
        });
      });
    });
  });
});
