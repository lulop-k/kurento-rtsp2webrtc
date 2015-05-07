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
    ice_servers: undefined
  }
});

if (args.ice_servers) {
  console.log("Use ICE servers: " + args.ice_servers);
  kurentoUtils.WebRtcPeer.prototype.server.iceServers = JSON.parse(args.ice_servers);
} else {
  console.log("Use freeice")
}

var videoInput;
var address;
var webRtcPeer;
var pipeline;

window.onload = function() {
	console = new Console('console', console);
	videoInput = document.getElementById('videoInput');
	address = document.getElementById('address');
	address.value = 'http://files.kurento.org/video/puerta-del-sol.ts';
}

function start() {
	if(!address.value){
	  window.alert("You must set the video source URL first");
	  return;
	}
	address.disabled = true;
	showSpinner(videoOutput);
	webRtcPeer = kurentoUtils.WebRtcPeer.startRecvOnly(videoOutput, onOffer, onError);
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
}

function onOffer(sdpOffer){
	kurentoClient(args.ws_uri, function(error, kurentoClient) {
		if(error) return onError(error);

		kurentoClient.create("MediaPipeline", function(error, p) {
			if(error) return onError(error);

			pipeline = p;

			pipeline.create("PlayerEndpoint", {uri: address.value}, function(error, player){
			  if(error) return onError(error);

			  pipeline.create("WebRtcEndpoint", function(error, webRtc){
				if(error) return onError(error);

				webRtc.processOffer(sdpOffer, function(error, sdpAnswer){
					if(error) return onError(error);

					webRtcPeer.processSdpAnswer(sdpAnswer);
				});

        pipeline.create('GStreamerFilter', {command : 'capsfilter caps=video/x-raw,framerate=15/1', filterType: "VIDEO"}, function(error, gstFilter){
          if(error) return onError(error);

          player.connect(gstFilter, function(error){
            if(error) return onError(error);

            gstFilter.connect(webRtc, function(error){
              if(error) return onError(error);

              console.log("PlayerEndpoint-->WebRtcEndpoint connection established");

              player.play(function(error){
                if(error) return onError(error);

                console.log("Player playing ...");
              });
          });
  				});
        });
			});
			});
		});
	});
}

function onError(error) {
	if(error) console.error(error);
	stop();
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
