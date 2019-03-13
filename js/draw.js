window.requestAnimationFrame = (function() {
	return window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		function(callback) {
			window.setTimeout(callback, 1000 / 60); //每秒60帧
		}
})();

function CanvasLayer(options) {
	this.options = options || {};
	this.show();
}

CanvasLayer.prototype.init = function() {
	//初始化canvas底层设置
	var map = document.getElementById('map');
	var canvas = this.canvas = document.createElement('canvas');
	var ctx = this.ctx = this.canvas.getContext('2d');
	canvas.style.cssText = 'position:absolute;' + 'left:0;' + 'top:0;' + 'z-index:200 ;';
	this.adjustSize();
	this.adjustRatio(ctx);  //调整图像的分辨率
	map.appendChild(canvas);
	this.draw();
	return this.canvas;
}

CanvasLayer.prototype.adjustSize = function() {
	var canvas = this.canvas;
	canvas.style.width = '2400px';
	canvas.style.height = '1080px';
};

CanvasLayer.prototype.adjustRatio = function(ctx) {
	var backingStore = ctx.backingStorePixelRatio || ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1;
	var pixelRatio = (window.devicePixelRatio || 1) / backingStore;
	
	var canvasWidth = ctx.canvas.width || 1536;
	var canvasHeight = ctx.canvas.height || 402;

	ctx.canvas.width = canvasWidth * pixelRatio;
	ctx.canvas.height = canvasHeight * pixelRatio;
	ctx.canvas.style.width = canvasWidth + 'px';
	ctx.canvas.style.height = canvasHeight + 'px';
	ctx.scale(pixelRatio, pixelRatio);
};

CanvasLayer.prototype.draw = function() {
	//绘制canvas底层
	var self = this;
	var args = arguments;
	clearTimeout(self.timeoutID);
	self.timeoutID = setTimeout(function() {
		self._draw();
	}, 15);
}

CanvasLayer.prototype._draw = function() {
	//触发绑定draw事件
	//this.dispatchEvent('draw');
	this.options.update && this.options.update.call(this);
}

CanvasLayer.prototype.getContainer = function() {
	//获得原始canvas
	return this.canvas;
};

CanvasLayer.prototype.show = function() {
	//显示canvas
	if(!this.canvas) {
		this.init();
	}
	this.canvas.style.display = 'block';
};

CanvasLayer.prototype.hide = function() {
	//隐藏canvas
	this.canvas.style.display = 'none';
};

var MoveLine = function(userOptions) {
	/*
	 1.定义canvas动态线条
	 2.绘制动画
	 3.定时触发动画  
	*/

	var self = this;

	var options = {
		//marker点半径
		markerRadius: 3,
		//marker点颜色,为空或null则默认取线条颜色
		markerColor: '#fff',
		//线条宽度
		lineWidth: 1,
		//线条颜色
		color: '#F9815C',
		//移动点半径
		moveRadius: 2,
		//移动点颜色
		fillColor: '#fff',
		//移动点阴影颜色
		shadowColor: '#fff',
		//移动点阴影大小
		shadowBlur: 5
	};
	var baseLayer = null,
		animationLayer = null,
		animationFlag = true,
		width = '2200',
		height = '1080',
		markLines = [];
	var merge = function merge(userOptions, options) {
		Object.keys(userOptions).forEach(function(key) {
			options[key] = userOptions[key];
		});
	};

	function Marker(opts) {
		this.name = opts.name;
		this.location = opts.location;
		this.color = opts.color;
	}

	Marker.prototype.draw = function(context) {
		var pixel = this.location;
		context.save();
		context.beginPath();
		context.fillStyle = options.markerColor || this.color;
		context.arc(pixel[0], pixel[1], options.markerRadius, 0, Math.PI * 2, true);
		context.closePath();
		context.fill();

		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.font = '12px Microsoft YaHei';
		context.fillStyle = this.color;
		context.fillText(this.name, pixel[0], pixel[1] - 10);
		context.restore();
	};

	function MarkLine(opts) {
		this.from = opts.from;
		this.to = opts.to;
		this.step = 0;
	}

	MarkLine.prototype.getPointList = function(from, to) {
		var points = [
			[from.x, from.y],
			[to.x, to.y]
		];
		var ex = points[1][0];
		var ey = points[1][1];
		points[3] = [ex, ey];
		points[1] = this.getOffsetPoint(points[0], points[3]);
		points[2] = this.getOffsetPoint(points[3], points[0]);
		points = this.smoothSpline(points, false);
		//修正最后一点在插值产生的偏移
		points[points.length - 1] = [ex, ey];
		return points;
	};

	MarkLine.prototype.getOffsetPoint = function(start, end) {
		var distance = this.getDistance(start, end) / 3;
		var angle, dX, dY;
		var mp = [start[0], start[1]];
		var deltaAngle = -0.2; //偏移0.2弧度
		if(start[0] != end[0] && start[1] != end[1]) {
			//斜率存在
			var k = (end[1] - start[1]) / (end[0] - start[0]);
			angle = Math.atan(k);
		} else if(start[0] == end[0]) {
			//垂直线
			angle = (start[1] <= end[1] ? 1 : -1) * Math.PI / 2;
		} else {
			//水平线
			angle = 0;
		}
		if(start[0] <= end[0]) {
			angle -= deltaAngle;
			dX = Math.round(Math.cos(angle) * distance);
			dY = Math.round(Math.sin(angle) * distance);
			mp[0] += dX;
			mp[1] += dY;
		} else {
			angle += deltaAngle;
			dX = Math.round(Math.cos(angle) * distance);
			dY = Math.round(Math.sin(angle) * distance);
			mp[0] -= dX;
			mp[1] -= dY;
		}
		return mp;
	};

	MarkLine.prototype.smoothSpline = function(points, isLoop) {
		var len = points.length;
		var ret = [];
		var distance = 0;
		for(var i = 1; i < len; i++) {
			distance += this.getDistance(points[i - 1], points[i]);
		}
		var segs = distance / 2;
		segs = segs < len ? len : segs;
		for(var i = 0; i < segs; i++) {
			var pos = i / (segs - 1) * (isLoop ? len : len - 1);
			var idx = Math.floor(pos);
			var w = pos - idx;
			var p0;
			var p1 = points[idx % len];
			var p2;
			var p3;
			if(!isLoop) {
				p0 = points[idx === 0 ? idx : idx - 1];
				p2 = points[idx > len - 2 ? len - 1 : idx + 1];
				p3 = points[idx > len - 3 ? len - 1 : idx + 2];
			} else {
				p0 = points[(idx - 1 + len) % len];
				p2 = points[(idx + 1) % len];
				p3 = points[(idx + 2) % len];
			}
			var w2 = w * w;
			var w3 = w * w2;

			ret.push([this.interpolate(p0[0], p1[0], p2[0], p3[0], w, w2, w3), this.interpolate(p0[1], p1[1], p2[1], p3[1], w, w2, w3)]);
		}
		return ret;
	};

	MarkLine.prototype.interpolate = function(p0, p1, p2, p3, t, t2, t3) {
		var v0 = (p2 - p0) * 0.5;
		var v1 = (p3 - p1) * 0.5;
		return(2 * (p1 - p2) + v0 + v1) * t3 + (-3 * (p1 - p2) - 2 * v0 - v1) * t2 + v0 * t + p1;
	};

	MarkLine.prototype.getDistance = function(p1, p2) {
		return Math.sqrt((p1[0] - p2[0]) * (p1[0] - p2[0]) + (p1[1] - p2[1]) * (p1[1] - p2[1]));
	};

	MarkLine.prototype.drawMarker = function(context) {
		this.from.draw(context);
		this.to.draw(context);
	};
	MarkLine.prototype.drawLinePath = function(context) {
		var pointList = this.path = this.getPointList({
			'x': this.from.location[0],
			'y': this.from.location[1]
		}, {
			'x': this.to.location[0],
			'y': this.to.location[1]
		});
		var len = pointList.length;
		context.save();
		context.beginPath();
		context.lineWidth = options.lineWidth;
		context.strokeStyle = options.color;

		context.moveTo(pointList[0][0], pointList[0][1]);
		for(var i = 0; i < len; i++) {
			context.lineTo(pointList[i][0], pointList[i][1]);
		}
		context.stroke();
		context.restore();
		this.step = 0;
	};
	MarkLine.prototype.drawMoveCircle = function(context) {
		var pointList = this.path || this.getPointList({
			'x': this.from.location[0],
			'y': this.from.location[1]
		}, {
			'x': this.to.location[0],
			'y': this.to.location[1]
		});
		context.save();
		context.fillStyle = options.fillColor;
		context.shadowColor = options.shadowColor;
		context.shadowBlur = options.shadowBlur;
		context.beginPath();
		context.arc(pointList[this.step][0], pointList[this.step][1], options.moveRadius, 0, Math.PI * 2, true);
		context.fill();
		context.closePath();
		context.restore();
		this.step += 1;
		if(this.step >= pointList.length) {
			this.step = 0;
		}
	};

	//底层canvas渲染，标注，线条
	var brush = function brush() {
		var baseCtx = baseLayer.canvas.getContext('2d');
		if(!baseCtx) {
			return;
		}

		addMarkLine();

		baseCtx.clearRect(0, 0, width, height);

		markLines.forEach(function(line) {
			line.drawMarker(baseCtx);
			line.drawLinePath(baseCtx);
		});
	};

	//上层canvas渲染，动画效果
	var render = function render() {
		var animationCtx = animationLayer.canvas.getContext('2d');
		if(!animationCtx) {
			return;
		}

		if(!animationFlag) {
			animationCtx.clearRect(0, 0, width, height);
			return;
		}

		animationCtx.fillStyle = 'rgba(0,0,0,.93)';
		var prev = animationCtx.globalCompositeOperation;
		animationCtx.globalCompositeOperation = 'destination-in';
		animationCtx.fillRect(0, 0, width, height);
		animationCtx.globalCompositeOperation = prev;

		for(var i = 0; i < markLines.length; i++) {
			var markLine = markLines[i];
			markLine.drawMoveCircle(animationCtx); //移动圆点
		}
	};

	var addMarkLine = function addMarkLine() {
		markLines = [];
		var dataset = options.data;

		data.forEach(function(line) {
			markLines.push(new MarkLine({
				from: new Marker({
					name: line.from.name,
					location: [line.from.coordinate[0], line.from.coordinate[1]],
					color: options.color
				}),
				to: new Marker({
					name: line.to.name,
					location: [line.to.coordinate[0], line.to.coordinate[1]],
					color: options.color
				})
			}));
		});
	};

	var init = function init(options) {
		merge(userOptions, options);
		baseLayer = new CanvasLayer({
			update: brush
		});

		animationLayer = new CanvasLayer({
			update: render
		});

		(function drawFrame() {
			requestAnimationFrame(drawFrame);
			render();
		})();
	};
	init(options);
	self.options = options;
};

MoveLine.prototype.update = function(resetOpts) {
	for(var key in resetOpts) {
		this.options[key] = resetOpts[key];
	}
}