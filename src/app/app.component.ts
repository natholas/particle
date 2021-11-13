import { Component, HostListener, NgZone, OnInit } from '@angular/core';
import * as THREE from 'three/build/three';
import { angleToVec } from './lib/angle-to-vec';
import { random } from './lib/random';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BrightnessContrastShader } from 'three/examples/jsm/shaders/BrightnessContrastShader.js'
import { ColorCorrectionShader } from 'three/examples/jsm/shaders/ColorCorrectionShader.js'

const queryCount = parseInt(document.location.search.split('count=')?.[1])
const queryTeams = parseInt(document.location.search.split('teams=')?.[1]) || 2

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  scale = 0.8
  width = (Math.ceil(window.innerWidth * this.scale / 2) * 2)
  height = (Math.ceil(window.innerHeight * this.scale / 2) * 2)
  numberOfPoints = queryCount || 10000
  trailLength = 0.015
  frameCount = 0
  teams = [
    {
      color: [2, 0, 0],
      speed: 1,
      turnAmount: 20,
      lookAheadDist: 20,
      lookAheadAngle: 45,
      turnThreshold: 100,
      rotationRandomness: 4,
      respect: 40
    },
  ]
  scene
  renderer
  composer
  camera
  clearer
  gl
  spheres: {directions: number[], geometry: any, material: any}[] = []
  canvas: HTMLCanvasElement
  buffer = new Uint8ClampedArray(this.width * this.height * 4)

  @HostListener('window:keyup', ['$event'])
  keyEvent(event: KeyboardEvent) {
    // if (event.key === 'r') {
      this.randomize()
      this.updateColors()
    // }
  }

  constructor(private zone: NgZone) {}

  ngOnInit() {
    for (let i = 1; i < queryTeams; i++) {
      this.teams.push(JSON.parse(JSON.stringify(this.teams[0])))
    }

    this.randomize()
    
    this.zone.runOutsideAngular(() => {
      this.canvas = document.querySelector('canvas')
      this.scene = new THREE.Scene();

      this.setupCamera()
      this.setupPoints()
      this.setupRenderer()
      this.setupClearer()
      this.render()
    })
  }

  randomize() {
    this.teams.forEach((team, i) => {
      team.lookAheadAngle = random(20, 35)
      team.lookAheadDist = random(10, 50)
      team.respect = random(10, 50)
      team.rotationRandomness = random(0, 15)
      team.turnAmount = random(8, 30)
      team.turnThreshold = random(50, 150)
      team.color = this.randomColor()
    })
  }

  updateTrail() {
    this.clearer.material.opacity = this.trailLength
  }
  
  render() {
    window.requestAnimationFrame(this.render.bind(this))
    this.gl.readPixels(0, 0, this.width, this.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.buffer);
    
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
    const color = this.getColor(x + v[0] * dist, y + v[1] * dist)
    const max = Math.max(...color)
    if (max > team.turnThreshold && !this.checkColorMatch(team.color, color)) {
      return random(team.respect)
    }
  }

  checkSide(x: number, y: number, direction: number, dist: number, team, dir: 1 | -1) {
    const vector = angleToVec(direction + team.lookAheadAngle * dir)
    const color = this.getColor(x + vector[0] * dist, y + vector[1] * dist)
    const max = Math.max(...color)

    const matchesColor = this.checkColorMatch(team.color, color)
    const t = team.turnThreshold
    if (max < t) return 0
    if (matchesColor) return team.turnAmount * dir
    else return (-team.turnAmount) * dir
  }

  checkColorMatch(color1: number[], color2: number[]) {
    if (!color2[0] && !color2[0] && !color2[0]) return true
    const total1 = color1[0] + color1[1] + color1[2]
    const total2 = color2[0] + color2[1] + color2[2]

    const color1RedPercent = 1 / total1 * color1[0]
    const color1GreenPercent = 1 / total1 * color1[1]
    const color1BluePercent = 1 / total1 * color1[2]
    
    const color2RedPercent = 1 / total2 * color2[0]
    const color2GreenPercent = 1 / total2 * color2[1]
    const color2BluePercent = 1 / total2 * color2[2]

    const redDiff = Math.abs(color1RedPercent - color2RedPercent)
    const greenDiff = Math.abs(color1GreenPercent - color2GreenPercent)
    const blueDiff = Math.abs(color1BluePercent - color2BluePercent)

    return (redDiff + greenDiff + blueDiff) < 0.5
  }

  changeColor(teamI: number, color: number[]) {
    const sphere = this.spheres[teamI]
    const team = this.teams[teamI]
    team.color = color;
    this.updateColor(teamI)
  }

  updateColor(teamI: number) {
    const sphere = this.spheres[teamI]
    const team = this.teams[teamI]
    sphere.material.uniforms.color.value.r = team.color[0]
    sphere.material.uniforms.color.value.g = team.color[1]
    sphere.material.uniforms.color.value.b = team.color[2]
    sphere.material.uniformsNeedUpdate = true
  }
  updateColors() {
    this.teams.forEach((t, i) => this.updateColor(i))
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
  
      const vertex = new THREE.Vector3();
      const color = new THREE.Color( ...this.teams[teamI].color );
      const directions = []
  
      for ( let i = 0; i < pointsPerTeam; i ++ ) {
        vertex.x = ( Math.random() * 2 - 1 ) * this.width / 2;
        vertex.y = ( Math.random() * 2 - 1 ) * this.height / 2;
        vertex.toArray( positions, i * 3 );
        directions.push(Math.random() * 360)
      }
  
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );

      const material = new THREE.ShaderMaterial( {
        uniforms: {
          color: { value: color },
          pointTexture: { value: new THREE.TextureLoader().load( "/assets/spark1.png" ) }
        },
        vertexShader: document.getElementById( 'vertexshader' ).textContent,
        fragmentShader: document.getElementById( 'fragmentshader' ).textContent,
        blending: THREE.NormalBlending,
        depthTest: false,
        transparent: true
      } );
  
      const sphere = new THREE.Points( geometry, material );
      this.spheres.push({directions, geometry, material})
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

    this.gl = this.renderer.getContext()

    const brightness = new ShaderPass( BrightnessContrastShader );
    brightness.uniforms.brightness.value = -0.12
    this.composer.addPass( brightness );

    // if (this.teams.length === 1) {
    //   const colorShader = new ShaderPass( ColorCorrectionShader );
    //   colorShader.uniforms.mulRGB.value.x = 10
    //   colorShader.uniforms.mulRGB.value.y = 10
    //   colorShader.uniforms.mulRGB.value.z = 10
    //   this.composer.addPass( colorShader );
    // }

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

  randomColor() {
    const r =(Math.random() * 1.5)
    const g =(Math.random() * 1.5)
    const b =(Math.random() * 1.5)

    const color = [r,g,b]
    const i = Math.floor(Math.random() * 3)
    color[i] = 1.5
    return color
  }
}
