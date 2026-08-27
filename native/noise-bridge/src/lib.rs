use nnnoiseless::DenoiseState;
use std::ffi::{c_float, c_void};
use std::ptr;

const PCM_SCALE: f32 = 32_768.0;

struct NoiseState {
    denoiser: Box<DenoiseState<'static>>,
}

#[no_mangle]
pub extern "C" fn switchboard_noise_get_frame_size() -> usize {
    DenoiseState::FRAME_SIZE
}

#[no_mangle]
pub extern "C" fn switchboard_noise_create() -> *mut c_void {
    Box::into_raw(Box::new(NoiseState {
        denoiser: DenoiseState::new(),
    })) as *mut c_void
}

#[no_mangle]
/// Resets a noise-suppression state to its initial model state.
///
/// # Safety
///
/// `state` must be null or a live pointer returned by `switchboard_noise_create`.
pub unsafe extern "C" fn switchboard_noise_reset(state: *mut c_void) -> bool {
    let Some(state) = (state as *mut NoiseState).as_mut() else {
        return false;
    };
    state.denoiser = DenoiseState::new();
    true
}

#[no_mangle]
/// Processes exactly one RNNoise frame from `input` into `output`.
///
/// # Safety
///
/// `state` must point to a live state returned by `switchboard_noise_create`.
/// `input` and `output` must each reference at least
/// `switchboard_noise_get_frame_size()` readable or writable `c_float` values.
/// When non-null, `voice_probability` must reference one writable `c_float`.
pub unsafe extern "C" fn switchboard_noise_process_frame(
    state: *mut c_void,
    input: *const c_float,
    output: *mut c_float,
    voice_probability: *mut c_float,
) -> bool {
    let Some(state) = (state as *mut NoiseState).as_mut() else {
        return false;
    };
    if input.is_null() || output.is_null() {
        return false;
    }

    let input = std::slice::from_raw_parts(input, DenoiseState::FRAME_SIZE);
    let output = std::slice::from_raw_parts_mut(output, DenoiseState::FRAME_SIZE);
    let mut scaled_input = [0.0f32; DenoiseState::FRAME_SIZE];
    let mut scaled_output = [0.0f32; DenoiseState::FRAME_SIZE];
    for index in 0..DenoiseState::FRAME_SIZE {
        let sample = input[index];
        if !sample.is_finite() {
            return false;
        }
        scaled_input[index] = sample.clamp(-1.0, 1.0) * PCM_SCALE;
    }

    let probability = state
        .denoiser
        .process_frame(&mut scaled_output, &scaled_input);
    if !probability.is_finite() {
        return false;
    }

    for index in 0..DenoiseState::FRAME_SIZE {
        let sample = scaled_output[index] / PCM_SCALE;
        if !sample.is_finite() {
            return false;
        }
        output[index] = sample.clamp(-1.0, 1.0);
    }
    if !voice_probability.is_null() {
        ptr::write(voice_probability, probability.clamp(0.0, 1.0));
    }
    true
}

#[no_mangle]
/// Releases a noise-suppression state.
///
/// # Safety
///
/// `state` must be null or a live pointer returned by `switchboard_noise_create`
/// that has not already been destroyed.
pub unsafe extern "C" fn switchboard_noise_destroy(state: *mut c_void) {
    if !state.is_null() {
        drop(Box::from_raw(state as *mut NoiseState));
    }
}
