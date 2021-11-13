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
  numberOfPoints = 10000
  trailLength = 0.05
  frameCount = 0
  teams = [
    {
      color: 'rgb(125,0,255)',
      colorToLookForIndex: 2,
      dotSize: 4,
      speed: 2,
      turnAmount: 20,
      lookAheadDist: 20,
      lookAheadAngle: 45,
      turnThreshold: 100,
      rotationRandomness: 4
    },
    {
      color: 'rgb(255,255, 0)',
      colorToLookForIndex: 1,
      dotSize: 4,
      speed: 2,
      turnAmount: 20,
      lookAheadDist: 35,
      lookAheadAngle: 30,
      turnThreshold: 100,
      rotationRandomness: 4
    },
  ]
  scene
  renderer
  composer
  camera
  clearer
  spheres: {directions: number[], geometry: any}[] = []
  canvas: HTMLCanvasElement
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

  updateTrail() {
    this.clearer.material.opacity = this.trailLength
  }
  
  render() {
    window.requestAnimationFrame(this.render.bind(this))
    this.frameCount += 1
    const gl = this.renderer.getContext()
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.buffer);
    this.spheres.forEach((sphere, i) => {
      const team = this.teams[i]
      const geometry = sphere.geometry;
      const attributes = geometry.attributes;
      for ( let i = 0; i < attributes.position.array.length; i += 3 ) {
        const _x = attributes.position.array[ i ]
        const _y = attributes.position.array[ i + 1 ]
        const [x, y, direction] = this.transform(team, sphere.directions[i / 3], [_x, _y])

        sphere.directions[i / 3] += direction
        attributes.position.array[ i ] += x
        attributes.position.array[ i + 1 ] += y
      }
  
      attributes.position.needsUpdate = true;
    })
    this.composer.render()
  }

  transform(team: any, direction: number, position: [number, number]) {
    const [x, y] = position
    let v = angleToVec(direction)
    const resp = [v[0] * team.speed, v[1] * team.speed]

    // Making sure we dont go out of bounds
    const outOfBounds = this.checkBounds(x, y)
    if (outOfBounds) return [v[0] * -2, v[1] * -2, 180 + random(90)]

    const dist = team.lookAheadDist

    let dir = this.checkFront(x, y, v, dist, team)

    if (dir === undefined) {
      const left = this.checkSide(x, y, direction, dist, team, -1)
      const right = this.checkSide(x, y, direction, dist, team, 1)
      dir = Math.abs(left) > Math.abs(right) ? left : right
    }

    resp.push((dir || 0) + random(team.rotationRandomness))
    return resp
  }

  checkFront(x: number, y: number, v: number[], dist: number, team) {
    const frontColor = this.getColor(x + v[0] * dist, y + v[1] * dist)
    const frontMax = Math.max(...frontColor)
    if (frontMax > team.turnThreshold && frontMax < frontColor[team.colorToLookForIndex]) {
      return 180
    }
  }

  checkSide(x: number, y: number, direction: number, dist: number, team, dir: 1 | -1) {
    const vector = angleToVec(direction + team.lookAheadAngle * dir)
    const color = this.getColor(x + vector[0] * dist, y + vector[1] * dist)
    const max = Math.max(...color)

    const v = color[team.colorToLookForIndex]
    const t = team.turnThreshold
    if (max < t) return 0
    if (v > t) return team.turnAmount * dir
    else if (max - v > t) return (-team.turnAmount) * dir
  }

  checkBounds(x: number, y: number) {
    const w = this.width / 2;
    const h = this.height / 2;
    if (x < -w || x > w || y < -h || y > h) return true
  }

  setupPoints() {
    const pointsPerTeam = Math.round(this.numberOfPoints / this.teams.length);
    for (let teamI = 0; teamI < this.teams.length; teamI++) {
      const positions = new Float32Array( pointsPerTeam * 3 );
      const colors = new Float32Array( pointsPerTeam * 3 );
      const sizes = new Float32Array( pointsPerTeam );
  
      const vertex = new THREE.Vector3();
      const directions = []
  
      for ( let i = 0; i < pointsPerTeam; i ++ ) {
        vertex.x = ( Math.random() * 2 - 1 ) * this.width / 2;
        vertex.y = ( Math.random() * 2 - 1 ) * this.height / 2;
        vertex.toArray( positions, i * 3 );
        const direction = Math.random() * 360
        directions.push(direction)
      }
  
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
      geometry.setAttribute( 'customColor', new THREE.BufferAttribute( colors, 3 ) );
      geometry.setAttribute( 'size', new THREE.BufferAttribute( sizes, 1 ) );
  
      const material = new THREE.PointsMaterial( { size: this.teams[teamI].dotSize, color: this.teams[teamI].color } );
  
      const sphere = new THREE.Points( geometry, material );
      this.spheres.push({directions, geometry: sphere.geometry})
      this.scene.add( sphere );
    }
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
    
    // const params = {
    //   exposure: 1000,
    //   bloomStrength: 0.1,
    //   bloomThreshold: 0.6,
    //   bloomRadius: 10
    // };
    // const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
    // bloomPass.threshold = params.bloomThreshold;
    // bloomPass.strength = params.bloomStrength;
    // bloomPass.radius = params.bloomRadius;
    // this.composer.addPass(bloomPass)

    const brightness = new ShaderPass( BrightnessContrastShader );
    brightness.uniforms.brightness.value = -0.2
    this.composer.addPass( brightness );
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
    this.clearer = plane
    this.scene.add( plane );
  }

  getColor(x: number, y: number) {
    x = Math.round(x + this.width / 2)
    y = Math.round(y + this.height / 2)
    let i = Math.round((y * this.width * 4) + x * 4)
    return [this.buffer[i], this.buffer[i + 1], this.buffer[i + 2]]
  }
}
