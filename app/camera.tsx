import SimpleIcon from "@/components/SimpleIcon";
import FileService from "@/services/FileService";
import { CameraType, CameraView, FlashMode, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

export default function CameraScreen() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();

    const [facing, setFacing] = useState<CameraType>("back");
    const [flash, setFlash] = useState<FlashMode>("off");
    // CameraView uses 'picture' | 'video' for mode
    const [mode, setMode] = useState<"picture" | "video">("picture");
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const cameraRef = useRef<CameraView>(null);

    if (!permission || !micPermission) {
        // Camera permissions are still loading.
        return <View style={styles.container} />;
    }

    if (!permission.granted || !micPermission.granted) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>
                    We need your permission to use the camera and microphone securely.
                </Text>
                <TouchableOpacity
                    style={styles.permissionButton}
                    onPress={async () => {
                        await requestPermission();
                        await requestMicPermission();
                    }}>
                    <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const toggleCameraFacing = () => {
        setFacing((current) => (current === "back" ? "front" : "back"));
    };

    const toggleFlash = () => {
        setFlash((current) => (current === "off" ? "on" : "off"));
    };

    const handleCapture = async () => {
        if (isProcessing) return;

        if (mode === "picture") {
            await takePhoto();
        } else {
            if (isRecording) {
                await stopRecording();
            } else {
                await startRecording();
            }
        }
    };

    const takePhoto = async () => {
        if (!cameraRef.current) return;
        setIsProcessing(true);
        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                skipProcessing: false,
            });

            if (photo) {
                const fileName = `Photo_${Date.now()}.jpg`;
                // Using cast to access public secureFile (exposed in previous step but maybe TS types not updated in memory?)
                // It is public now.
                await (FileService as any).secureFile(photo.uri, fileName, 'image/jpeg', 0);
                Alert.alert("Secured", "Photo encrypted successfully");
            }
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to capture photo");
        } finally {
            setIsProcessing(false);
        }
    };

    const startRecording = async () => {
        if (!cameraRef.current) return;
        setIsRecording(true);
        try {
            const video = await cameraRef.current.recordAsync({
                maxDuration: 60, // 1 min limit for security demo
            });

            if (video) {
                setIsProcessing(true);
                const fileName = `Video_${Date.now()}.mp4`;
                await (FileService as any).secureFile(video.uri, fileName, 'video/mp4', 0);
                Alert.alert("Secured", "Video encrypted successfully");
            }
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to record video");
        } finally {
            setIsRecording(false);
            setIsProcessing(false);
        }
    };

    const stopRecording = async () => {
        if (cameraRef.current && isRecording) {
            cameraRef.current.stopRecording();
            setIsRecording(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <CameraView
                style={styles.camera}
                facing={facing}
                mode={mode}
                flash={flash}
                ref={cameraRef}
            >
                {/* Top Controls */}
                <View style={styles.topControls}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                        <SimpleIcon name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleFlash} style={styles.iconButton}>
                        <SimpleIcon name={flash === 'on' ? 'flash' : 'flash-off'} size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Bottom Controls */}
                <View style={styles.bottomContainer}>
                    {/* Mode Switcher */}
                    <View style={styles.modeContainer}>
                        <TouchableOpacity onPress={() => setMode('picture')}>
                            <Text style={[styles.modeText, mode === 'picture' && styles.activeModeText]}>PHOTO</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setMode('video')}>
                            <Text style={[styles.modeText, mode === 'video' && styles.activeModeText]}>VIDEO</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.controlsRow}>
                        <View style={{ flex: 1 }} /> {/* Spacer */}

                        {/* Shutter Button */}
                        <TouchableOpacity
                            style={[
                                styles.shutterButton,
                                mode === 'video' && styles.videoShutter,
                                isRecording && styles.recordingShutter
                            ]}
                            onPress={handleCapture}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <ActivityIndicator color={mode === 'video' ? "#fff" : "#000"} />
                            ) : (
                                isRecording && <View style={styles.stopIcon} />
                            )}
                        </TouchableOpacity>

                        {/* Flip Button */}
                        <View style={{ flex: 1, alignItems: 'flex-start', paddingLeft: 40 }}>
                            <TouchableOpacity onPress={toggleCameraFacing} style={styles.iconButton}>
                                <SimpleIcon name="camera-reverse-outline" size={28} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </CameraView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
        padding: 20,
    },
    permissionText: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
    },
    permissionButton: {
        backgroundColor: '#4a90e2',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        marginBottom: 12,
    },
    permissionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    backButton: {
        padding: 10,
    },
    backButtonText: {
        color: '#888',
        fontSize: 14,
    },
    camera: {
        flex: 1,
    },
    topControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 50,
        paddingHorizontal: 20,
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 40,
        paddingTop: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    modeContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 30,
    },
    modeText: {
        color: '#ccc',
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 1,
    },
    activeModeText: {
        color: '#fbbf24', // Amber/Gold color
    },
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shutterButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#fff',
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoShutter: {
        backgroundColor: '#ef4444',
    },
    recordingShutter: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 6,
        borderColor: 'rgba(239, 68, 68, 0.4)',
    },
    stopIcon: {
        width: 24,
        height: 24,
        borderRadius: 4,
        backgroundColor: '#fff',
    }
});
