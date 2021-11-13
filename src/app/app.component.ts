import { Component, NgZone, OnInit } from '@angular/core';
import * as THREE from 'three/build/three';
import { angleToVec } from './lib/angle-to-vec';
import { random } from './lib/random';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BrightnessContrastShader } from 'three/examples/jsm/shaders/BrightnessContrastShader.js'

import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  width = (Math.ceil(window.innerWidth / 2) * 2)
  height = (Math.ceil(window.innerHeight / 2) * 2)
  numberOfPoints = 6000
  trailLength = 0.018
  frameCount = 0
  teams = [
    {
      color: 'rgb(255,0,255)',
      colorToLookForIndex: 0,
      dotSize: 4,
      speed: 2,
      turnAmount: 20,
      lookAheadDist: 20,
      lookAheadAngle: 30,
      turnThreshold: 100,
    },
    {
      color: 'rgb(0,255,100)',
      colorToLookForIndex: 1,
      dotSize: 4,
      speed: 1,
      turnAmount: 20,
      lookAheadDist: 20,
      lookAheadAngle: 30,
      turnThreshold: 100,
    },
  ]
  scene
  renderer
  composer
  camera
  
  canvas: HTMLCanvasElement
  points: {obj: any, direction: number, teamI: number}[] = []
  buffer = new Uint8ClampedArray(this.width * this.height * 4)

  constructor(private zone: NgZone) {}

  ngOnInit() {
    this.canvas = document.querySelector('canvas')
    this.scene = new THREE.Scene();

    this.setupCamera()
    this.setupPoints()
    this.setupRenderer()
    this.setupClearer()
    
    this.zone.runOutsideAngular(() => this.render())
  }
  
  render() {
    this.frameCount += 1
    const gl = this.renderer.getContext()
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.buffer);
    this.points.forEach(p => this.transform(p))
    // this.renderer.render(this.scene, this.camera);
    this.composer.render()
    window.requestAnimationFrame(this.render.bind(this))
  }

  transform(p: {obj: any, direction: number, teamI: number}) {
    const team = this.teams[p.teamI]
    const colorI = team.colorToLookForIndex
    const w = this.width / 2;
    const h = this.height / 2;
    const {x, y} = p.obj.position
    if (x < -w || x > w || y < -h || y > h) {
      let v = angleToVec(p.direction)
      const dir = new THREE.Vector3(v[0], v[1], 0)
      p.obj.translateOnAxis(dir, -2)
      p.direction += 180 + random(45)
    }
    let v = angleToVec(p.direction)
    
    let left = angleToVec(p.direction - team.lookAheadAngle)
    let right = angleToVec(p.direction + team.lookAheadAngle)
    p.direction = p.direction % 360
    const dist = team.lookAheadDist

    const leftColor = this.getColor(x + left[0] * dist, y + left[1] * dist)
    const rightColor = this.getColor(x + right[0] * dist, y + right[1] * dist)
    const frontColor = this.getColor(x + v[0] * dist, y + v[1] * dist)

    const leftMax = Math.max(...leftColor)
    const rightMax = Math.max(...rightColor)
    const frontMax = Math.max(...frontColor)
   
    if (frontMax > team.turnThreshold && frontMax < frontColor[colorI]) {
      p.direction += 180
    }

    if (leftMax > team.turnThreshold) {
      if (leftColor[colorI] > team.turnThreshold) p.direction -= team.turnAmount * Math.random() * 1.5
      else p.direction += team.turnAmount * Math.random() * 1.5
    }
    
    if (rightMax > team.turnThreshold) {
      if (rightColor[colorI] > team.turnThreshold) p.direction += team.turnAmount * Math.random() * 1.5
      else p.direction -= team.turnAmount * Math.random() * 1.5
    }
    
    const dir = new THREE.Vector3(v[0], v[1], 0)
    p.obj.translateOnAxis(dir, team.speed)
  }

  setupPoints() {
    const dotGeometry = new THREE.BufferGeometry();
    dotGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( new THREE.Vector3().toArray(), 3 ) );
    
    const pointsPerTeam = Math.round(this.numberOfPoints / this.teams.length)
    
    this.teams.forEach((team, teamI) => {
      const dotMaterial = new THREE.PointsMaterial( { size: team.dotSize, color: team.color } );
      for (let i = 0; i < pointsPerTeam; i++) {
        const obj = new THREE.Points( dotGeometry, dotMaterial );


        const x = random(this.width / 2)
        const y = random(this.height / 2)
        const direction = Math.random() * 360



        // let direction = random(360)
        // let [x, y] = angleToVec(direction)
        // x *= Math.random() * this.width / 8
        // y *= Math.random() * this.width / 8
        // direction = random(360)


        obj.translateX(x)
        obj.translateY(y)
        this.scene.add( obj );
        this.points.push({obj, direction, teamI})
      }
    })
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer( { canvas: this.canvas, precision: 'mediump', stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', depth: false } );
    this.renderer.setSize( this.width, this.height );
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.autoClear = false
    this.renderer.sortObjects = false
    this.composer = new EffectComposer( this.renderer );
    const renderPass = new RenderPass( this.scene, this.camera );
    renderPass.clear = false
    this.composer.addPass( renderPass );

    
    const params = {
      exposure: 1,
      bloomStrength: 0.1,
      bloomThreshold: 0.7,
      bloomRadius: 20
    };


    const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
    bloomPass.threshold = params.bloomThreshold;
    bloomPass.strength = params.bloomStrength;
    bloomPass.radius = params.bloomRadius;

    this.composer.addPass(bloomPass)

    const brightness = new ShaderPass( BrightnessContrastShader );
    brightness.uniforms.brightness.value = -0.2
    this.composer.addPass( brightness );


    // const hBlur = new ShaderPass( HorizontalBlurShader );
    // hBlur.uniforms.h.value = this.width / 2000000
    // hBlur.clear = false
    // this.composer.addPass( hBlur );

    // const vBlur = new ShaderPass( VerticalBlurShader );
    // vBlur.uniforms.v.value = 0
    // vBlur.clear = false
    // this.composer.addPass( vBlur );
  }

  setupCamera() {
    this.camera = new THREE.OrthographicCamera( this.width / - 2, this.width / 2, this.height / 2, this.height / - 2, 1, 1000 );
    this.camera.position.set(0,0,100)
    this.scene.add(this.camera);
  }

  setupClearer() {
    const geometry = new THREE.PlaneGeometry( this.width, this.height );
    const material = new THREE.MeshBasicMaterial( {color: 'black', opacity: this.trailLength} );
    material.transparent = true;
    const plane = new THREE.Mesh( geometry, material );
    this.scene.add( plane );
  }

  getColor(x: number, y: number) {
    x = Math.round(x + this.width / 2)
    y = Math.round(y + this.height / 2)
    let i = Math.round((y * this.width * 4) + x * 4)
    return [this.buffer[i], this.buffer[i + 1], this.buffer[i + 2]]
  }
}
