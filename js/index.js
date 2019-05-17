/*
* (C) Copyright 2014 Kurento (http://kurento.org/)
*
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the GNU Lesser General Public License
* (LGPL) version 2.1 which accompanies this distribution, and is available at
* http://www.gnu.org/licenses/lgpl-2.1.html
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
* Lesser General Public License for more details.
*
*/

function getopts(args, opts)
{
  var result = opts.default || {};
  args.replace(
      new RegExp("([^?=&]+)(=([^&]*))?", "g"),
      function($0, $1, $2, $3) { result[$1] = $3; });

  return result;
};

var args = getopts(location.search,
{
  default:
  {
    ws_uri: 'ws://' + location.hostname + ':8888/kurento',
    file_uri: 'file:///tmp/kurento-hello-world-recording.webm',
    ice_servers: undefined
  }
});

const IDLE = 0;
const DISABLED = 1;
const CALLING = 2;
const PLAYING = 3;

function setStatus(nextState){
  switch(nextState){
    case IDLE:
      $('#start').attr('disabled', false)
      $('#stop').attr('disabled',  true)
      $('#play').attr('disabled',  false)
      break;

    case CALLING:
      $('#start').attr('disabled', true)
      $('#stop').attr('disabled',  false)
      $('#play').attr('disabled',  true)
      break;

    case PLAYING:
      $('#start').attr('disabled', true)
      $('#stop').attr('disabled',  false)
      $('#play').attr('disabled',  true)
      break;

    case DISABLED:
      $('#start').attr('disabled', true)
      $('#stop').attr('disabled',  true)
      $('#play').attr('disabled',  true)
      break;
  }
}

if (args.ice_servers) {
  console.log("Use ICE servers: " + args.ice_servers);
  kurentoUtils.WebRtcPeer.prototype.server.iceServers = JSON.parse(args.ice_servers);
} else {
  console.log("Use freeice")
}


window.addEventListener('load', function(){
  console = new Console('console', console);
	var videoOutput = document.getElementById('videoOutput');
	var address = document.getElementById('address');
	address.value = 'rtsp://172.30.65.235:554/11';
  var pipeline;
  var webRtcPeer;

  startButton = document.getElementById('start');
  startButton.addEventListener('click', start);

  stopButton = document.getElementById('stop');
  stopButton.addEventListener('click', stop);

  playButton = document.getElementById('play');
  playButton.addEventListener('click', play);

  function start() {
	setStatus(DISABLED);
  	if(!address.value){
  	  window.alert("You must set the video source URL first");
  	  return;
  	}
  	address.disabled = true;
  	showSpinner(videoOutput);
    var options = {
      remoteVideo : videoOutput
    };
	  
    if (args.ice_servers) {
      console.log("Use ICE servers: " + args.ice_servers);
      options.configuration = {
        iceServers : JSON.parse(args.ice_servers)
      };
    } else {
      console.log("Use freeice")
    }
    
    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options,
      function(error){
        if(error){
          return console.error(error);
        }
        webRtcPeer.generateOffer(onOffer);
        webRtcPeer.peerConnection.addEventListener('iceconnectionstatechange', function(event){
          if(webRtcPeer && webRtcPeer.peerConnection){
            console.log("oniceconnectionstatechange -> " + webRtcPeer.peerConnection.iceConnectionState);
            console.log('icegatheringstate -> ' + webRtcPeer.peerConnection.iceGatheringState);
          }
        });
    });
  }

  function onOffer(error, sdpOffer){
    if(error) return onError(error);

  	kurentoClient(args.ws_uri, function(error, kurentoClient) {
  		if(error) return onError(error);

  		kurentoClient.create("MediaPipeline", function(error, p) {
  			if(error) return onError(error);

  			pipeline = p;

  			pipeline.create("PlayerEndpoint", {uri: address.value}, function(error, player){
  			  if(error) return onError(error);

  			  pipeline.create("WebRtcEndpoint", function(error, webRtcEndpoint){
  				if(error) return onError(error);

          setIceCandidateCallbacks(webRtcEndpoint, webRtcPeer, onError);
				  
  			  pipeline.create("RecorderEndpoint", {uri: args.file_uri}, function(error, recorder){
  				if(error) return onError(error);

  				webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer){
  					if(error) return onError(error);

            webRtcEndpoint.gatherCandidates(onError);

  					webRtcPeer.processAnswer(sdpAnswer);
  				});

  				player.connect(webRtcEndpoint, function(error){
  					if(error) return onError(error);

  					console.log("PlayerEndpoint-->WebRtcEndpoint connection established");

  					player.play(function(error){
  					  if(error) return onError(error);

  					  console.log("Player playing ...");
					  setStatus(PLAYING)
  					});
				        webRtcEndpoint.connect(recorder, function(error){
  					  if(error) return onError(error);

  					  console.log("WebRtcEndpoint-->RecorderEndpoint connection established");

  					  recorder.record()(function(error){
  					    if(error) return onError(error);

  					    console.log("Player Recording ...");
					    setStatus(CALLING);
  					  });
  				     });
  				});
			  });
  			});
  			});
  		});
  	});
  }

  function stop() {
    address.disabled = false;
    if (webRtcPeer) {
      webRtcPeer.dispose();
      webRtcPeer = null;
    }
    if(pipeline){
      pipeline.release();
      pipeline = null;
    }
    hideSpinner(videoOutput);
    setStatus(IDLE);
  }
  
  function play(){
    setStatus(DISABLED)
    showSpinner(videoOutput);

    var options =
    {
      remoteVideo: videoOutput
    }

    if (args.ice_servers) {
      console.log("Use ICE servers: " + args.ice_servers);
      options.configuration = {
        iceServers : JSON.parse(args.ice_servers)
      };
    } else {
      console.log("Use freeice")
    }

    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error)
    {
      if(error) return onError(error)

      this.generateOffer(onPlayOffer)
    });
  }
  
  function onPlayOffer(error, sdpOffer){
    if(error) return onError(error);

    co(function*(){
      try{
	      
//	kurentoClient(args.ws_uri, function(error, kurentoClient) {
//  		if(error) return onError(error);
//		
//	kurentoClient.create("MediaPipeline", function(error, p) {
//  			if(error) return onError(error);
		
        var client = yield kurentoClient(args.ws_uri);

        pipeline = yield client.create('MediaPipeline');
	
//	pipeline = p;
	
//	pipeline.create("WebRtcEndpoint", function(error, webRtcEndpoint){
//  				if(error) return onError(error);

        var webRtc = yield pipeline.create('WebRtcEndpoint');
	console.log("before setIceCandidateCallbacks ------")
//	setIceCandidateCallbacks(webRtcPeer, webRtcEndpoint, onError);
        setIceCandidateCallbacks(webRtc, webRtcPeer, onError)
	console.log("Return from setIceCandidateCallbacks ------")
		
//	pipeline.create("PlayerEndpoint", {uri: address.value}, function(error, player){
//  			  if(error) return onError(error);

        var player = yield pipeline.create('PlayerEndpoint', {uri : args.file_uri});

        player.on('EndOfStream', stop);
      console.log("Player connect ------")
      yield player.connect(webRtc);
	
//	player.connect(webRtcEndpoint, function(error){
//  					if(error) return onError(error);
//
//  					console.log("RecorderEndpoint-->PlayerEndpoint connection established");
//
//  					player.play(function(error){
//  					  if(error) return onError(error);
//
//  					  console.log("Player playing ...");
//  					});
//
	console.log("processOffer ------")
        var sdpAnswer = yield webRtc.processOffer(sdpOffer);
	console.log("gatherCandidates ------")
        webRtc.gatherCandidates(onError);
	console.log("processAnswer ------")
        webRtcPeer.processAnswer(sdpAnswer);

	console.log("player.play ------")
        yield player.play()
	console.log("Playing video ------")

        setStatus(PLAYING)
//	});
//	});
//	});
//	});
//	});
      }
      catch(e)
      {
        onError(e);
      }
    })();
  }

  setStatus(IDLE);

});

function setIceCandidateCallbacks(webRtcEndpoint, webRtcPeer, onError){
  webRtcPeer.on('icecandidate', function(candidate){
    console.log("Local icecandidate " + JSON.stringify(candidate));

    candidate = kurentoClient.register.complexTypes.IceCandidate(candidate);

    webRtcEndpoint.addIceCandidate(candidate, onError);

  });
  webRtcEndpoint.on('OnIceCandidate', function(event){
    var candidate = event.candidate;

    console.log("Remote icecandidate " + JSON.stringify(candidate));

    webRtcPeer.addIceCandidate(candidate, onError);
  });
}

function onError(error) {
  if(error)
  {
    console.error(error);
    stop();
  }
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = 'img/transparent-1px.png';
		arguments[i].style.background = "center transparent url('img/spinner.gif') no-repeat";
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = 'img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});
